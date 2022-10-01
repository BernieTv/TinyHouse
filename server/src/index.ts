require('dotenv').config();

import express, { Application } from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { ApolloServer } from 'apollo-server-express';

import { connectDatabase } from './database';
import { typeDefs, resolvers } from './graphql';

const mount = async (app: Application) => {
	const db = await connectDatabase();

	app.use(bodyParser.json({ limit: '2mb' }));
	app.use(cookieParser(process.env.SECRET));

	async function startServer() {
		const apolloServer = new ApolloServer({
			typeDefs,
			resolvers,
			context: ({ req, res }) => ({ db, req, res }),
		});
		await apolloServer.start();
		apolloServer.applyMiddleware({ app, path: '/api' });
	}
	startServer();

	app.listen(process.env.PORT);

	console.log(`[app]: http://localhost:${process.env.PORT}`);
};

mount(express());
