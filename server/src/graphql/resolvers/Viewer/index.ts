import { IResolvers } from 'graphql-tools';
import crypto from 'crypto';
import { InsertOneResult, WithId } from 'mongodb';
import { Request, Response } from 'express';

import { Viewer, Database, User } from '../../../lib/types';
import { Google, Stripe } from '../../../lib/api';
import { LogInArgs, ConnectStripeArgs } from './types';
import { authorize } from '../../../lib/utils';

const cookieOption = {
	httpOnly: true,
	sameSite: true,
	signed: true,
	secure: process.env.NODE_ENV === 'development' ? false : true,
};

const logInViaGoogle = async (
	code: string,
	token: string,
	db: Database,
	res: Response
): Promise<User | undefined> => {
	const { user } = await Google.logIn(code);

	if (!user) {
		throw new Error('Google login error');
	}

	const userNamesList = user.names && user.names.length ? user.names : null;
	const userPhotosList = user.photos && user.photos.length ? user.photos : null;
	const userEmailList =
		user.emailAddresses && user.emailAddresses.length ? user.emailAddresses : null;

	const userName = userNamesList ? userNamesList[0].displayName : null;

	const userId =
		userNamesList && userNamesList[0]?.metadata?.source
			? userNamesList[0].metadata.source.id
			: null;

	const userAvatar =
		userPhotosList && userPhotosList[0].url ? userPhotosList[0].url : null;

	const userEmail =
		userEmailList && userEmailList[0].value ? userEmailList[0].value : null;

	if (!userId || !userName || !userAvatar || !userEmail) {
		throw new Error('Google login error');
	}

	const updateRes = await db.users.findOneAndUpdate(
		{ _id: userId },
		{
			$set: {
				name: userName,
				avatar: userAvatar,
				contact: userEmail,
				token,
			},
		},
		{ returnDocument: 'after' }
	);

	let viewer: WithId<User> | InsertOneResult<User> | null = updateRes.value;

	if (!viewer) {
		const insertResult = await db.users.insertOne({
			_id: userId,
			token,
			name: userName,
			avatar: userAvatar,
			contact: userEmail,
			income: 0,
			bookings: [],
			listings: [],
		});

		if (insertResult.acknowledged) {
			viewer = insertResult;
		}
	}

	res.cookie('viewer', userId, {
		...cookieOption,
		maxAge: 21 * 24 * 60 * 60 * 1000,
	});

	return viewer as User;
};

const loginViaCookie = async (
	token: string,
	db: Database,
	req: Request,
	res: Response
): Promise<User | undefined> => {
	const updateRes = await db.users.findOneAndUpdate(
		{ _id: req.signedCookies.viewer },
		{ $set: { token } },
		{ returnDocument: 'after' }
	);

	const viewer = updateRes.value;

	if (!viewer) {
		res.clearCookie('viewer', cookieOption);
	}

	return viewer as User;
};

export const viewerResolvers: IResolvers = {
	Query: {
		authUrl: (): string => {
			try {
				return Google.authUrl;
			} catch (error) {
				throw new Error(`Failed to query Google Auth Url: ${error}`);
			}
		},
	},
	Mutation: {
		logIn: async (
			_root: undefined,
			{ input }: LogInArgs,
			{ db, req, res }: { db: Database; req: Request; res: Response }
		): Promise<Viewer> => {
			try {
				const code = input ? input.code : null;
				const token = crypto.randomBytes(16).toString('hex');

				const viewer: User | undefined = code
					? await logInViaGoogle(code, token, db, res)
					: await loginViaCookie(token, db, req, res);

				if (!viewer) {
					return { didRequest: true };
				}

				return {
					_id: viewer._id,
					token: viewer.token,
					avatar: viewer.avatar,
					walletId: viewer.walletId,
					didRequest: true,
				};
			} catch (error) {
				throw new Error(`Failed to log in: ${error}`);
			}
		},
		logOut: (
			_root: undefined,
			args: Record<string, never>,
			{ res }: { res: Response }
		): Viewer => {
			try {
				res.clearCookie('viewer', cookieOption);
				return { didRequest: true };
			} catch (error) {
				throw new Error(`Failed to log out: ${error}`);
			}
		},
		connectStripe: async (
			_root: undefined,
			{ input }: ConnectStripeArgs,
			{ db, req }: { db: Database; req: Request }
		): Promise<Viewer> => {
			try {
				const { code } = input;

				let viewer = await authorize(db, req);
				if (!viewer) {
					throw new Error('viewer cannot be found');
				}

				const wallet = await Stripe.connect(code);
				if (!wallet) {
					throw new Error('stripe grant error');
				}

				const updateRes = await db.users.findOneAndUpdate(
					{ _id: viewer._id },
					{ $set: { walletId: wallet.stripe_user_id } },
					{ returnDocument: 'after' }
				);

				if (!updateRes.value) {
					throw new Error('viewer could not be updated');
				}

				viewer = updateRes.value;

				return {
					_id: viewer._id,
					token: viewer.token,
					avatar: viewer.avatar,
					walletId: viewer.walletId,
					didRequest: true,
				};
			} catch (error) {
				throw new Error(`Failed to connect with Stripe: ${error}`);
			}
		},
		disconnectStripe: async (
			_root: undefined,
			args: Record<string, never>,
			{ db, req }: { db: Database; req: Request }
		): Promise<Viewer> => {
			try {
				let viewer = await authorize(db, req);
				if (!viewer) {
					throw new Error('viewer cannot be found');
				}

				const updateRes = await db.users.findOneAndUpdate(
					{ _id: viewer._id },
					{ $set: { walletId: undefined } },
					{ returnDocument: 'after' }
				);

				if (!updateRes.value) {
					throw new Error('viewer could not be updated');
				}

				viewer = updateRes.value;

				return {
					_id: viewer._id,
					token: viewer.token,
					avatar: viewer.avatar,
					walletId: viewer.walletId,
					didRequest: true,
				};
			} catch (error) {
				throw new Error(`Failed to disconnect with Stripe: ${error}`);
			}
		},
	},
	Viewer: {
		id: (viewer: Viewer): string | undefined => {
			return viewer._id;
		},
		hasWallet: (viewer: Viewer): boolean | undefined => {
			return viewer.walletId ? true : undefined;
		},
	},
};
