require('dotenv').config();

import express, { Application } from 'express';
import { ApolloServer } from 'apollo-server-express';

import { connectDatabase } from './database';
import { typeDefs, resolvers } from './graphql';

const mount = async (app: Application) => {
	const db = await connectDatabase();

	async function startServer() {
		const apolloServer = new ApolloServer({
			typeDefs,
			resolvers,
			context: () => ({ db }),
		});
		await apolloServer.start();
		apolloServer.applyMiddleware({ app, path: '/api' });
	}
	startServer();

	app.listen(process.env.PORT);

	console.log(`[app]: http://localhost:${process.env.PORT}`);
};

mount(express());
