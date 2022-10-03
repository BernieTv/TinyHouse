import { IResolvers } from 'graphql-tools';
import { Request } from 'express';
import { ObjectId, WithId } from 'mongodb';

import { Booking, Database, Listing, BookingsIndex } from '../../../lib/types';
import { Stripe } from '../../../lib/api';
import { authorize } from '../../../lib/utils';
import { CreateBookingArgs } from './types';

const resolveBookingsIndex = (
	bookingsIndex: BookingsIndex,
	checkInDate: string,
	checkOutDate: string
): BookingsIndex => {
	let dateCursor = new Date(checkInDate);
	const checkOut = new Date(checkOutDate);
	const newBookingsIndex: BookingsIndex = { ...bookingsIndex };

	while (dateCursor <= checkOut) {
		const y = dateCursor.getUTCFullYear();
		const m = dateCursor.getUTCMonth();
		const d = dateCursor.getUTCDate();

		if (!newBookingsIndex[y]) {
			newBookingsIndex[y] = {};
		}

		if (!newBookingsIndex[y][m]) {
			newBookingsIndex[y][m] = {};
		}

		if (!newBookingsIndex[y][m][d]) {
			newBookingsIndex[y][m][d] = true;
		} else {
			throw new Error(
				"selected dates can't overlap dates that have already been booked"
			);
		}

		dateCursor = new Date(dateCursor.getDate() + 86_400_000);
	}

	return newBookingsIndex;
};

export const bookingResolvers: IResolvers = {
	Mutation: {
		createBooking: async (
			_root: undefined,
			{ input }: CreateBookingArgs,
			{ db, req }: { db: Database; req: Request }
		): Promise<WithId<Booking> | null> => {
			try {
				const { id, source, checkIn, checkOut } = input;

				const viewer = await authorize(db, req);
				if (!viewer) {
					throw new Error('viewer cannot be found');
				}

				const listing = await db.listings.findOne({ _id: new ObjectId(id) });
				if (!listing) {
					throw new Error("listing can't be found");
				}

				if (listing.host === viewer._id) {
					throw new Error("viewer can't book own listing");
				}

				const checkInDate = new Date(checkIn);
				const checkOutDate = new Date(checkOut);

				if (checkOutDate < checkInDate) {
					throw new Error("check out date can't be before check in date");
				}

				const bookingsIndex = resolveBookingsIndex(
					listing.bookingsIndex,
					checkIn,
					checkOut
				);

				const totalPrice =
					listing.price *
					((checkOutDate.getDate() - checkInDate.getDate()) / 86_400_000 + 1);

				const host = await db.users.findOne({
					_id: listing.host,
				});

				if (!host || !host.walletId) {
					throw new Error(
						"the host either can't be found or is not connected with Stripe"
					);
				}

				await Stripe.charge(totalPrice, source, host.walletId);

				const insertRes = await db.bookings.insertOne({
					_id: new ObjectId(),
					listing: listing._id,
					tenant: viewer._id,
					checkIn,
					checkOut,
				});

				const insertedBooking: WithId<Booking> | null = await db.bookings.findOne({
					_id: insertRes.insertedId,
				});

				await db.users.updateOne(
					{
						_id: host._id,
					},
					{
						$inc: {
							income: totalPrice,
						},
					}
				);

				await db.users.updateOne(
					{
						_id: viewer._id,
					},
					{
						$push: {
							bookings: insertedBooking?._id,
						},
					}
				);

				await db.listings.updateOne(
					{
						_id: listing._id,
					},
					{
						$set: { bookingsIndex },
						$push: {
							bookings: insertedBooking?._id,
						},
					}
				);

				return insertedBooking;
			} catch (error) {
				throw new Error(`Failed to create a booking: ${error}`);
			}
		},
	},
	Booking: {
		id: (booking: Booking): string => {
			return booking._id.toString();
		},
		listing: (
			booking: Booking,
			_args: Record<string, never>,
			{ db }: { db: Database }
		): Promise<Listing | null> => {
			return db.listings.findOne({ _id: booking.listing });
		},
		tenant: async (
			booking: Booking,
			_args: Record<string, never>,
			{ db }: { db: Database }
		) => {
			return await db.users.findOne({ _id: booking.tenant });
		},
	},
};
