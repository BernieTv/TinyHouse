import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import {
	ApolloClient,
	InMemoryCache,
	ApolloProvider,
	useMutation,
	createHttpLink,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { Layout, Affix, Spin } from 'antd';

import reportWebVitals from './reportWebVitals';
import {
	AppHeader,
	Home,
	Host,
	Listing,
	NotFound,
	User,
	Listings,
	Login,
} from './sections';
import { Viewer } from './lib/types';
import { LOG_IN } from './lib/graphql/mutations';
import {
	LogIn as LogInData,
	LogInVariables,
} from './lib/graphql/mutations/LogIn/__generated__/LogIn';
import { AppHeaderSkeleton, ErrorBanner } from './lib/components';

import './styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

const httpLink = createHttpLink({
	uri: '/api',
});

const authLink = setContext((_, { headers }) => {
	const token = sessionStorage.getItem('token');

	return {
		headers: {
			...headers,
			'X-CSRF-TOKEN': token || '',
		},
	};
});

const client = new ApolloClient({
	uri: '/api',
	cache: new InMemoryCache(),
	link: authLink.concat(httpLink),
});

const initialViewer: Viewer = {
	id: null,
	token: null,
	avatar: null,
	hasWallet: null,
	didRequest: false,
};

const App = () => {
	const [viewer, setViewer] = useState<Viewer>(initialViewer);
	const [logIn, { error }] = useMutation<LogInData, LogInVariables>(LOG_IN, {
		onCompleted(data) {
			if (data.logIn && data.logIn) {
				setViewer(data.logIn);
			}

			if (data.logIn.token) {
				sessionStorage.setItem('token', data.logIn.token);
			} else {
				sessionStorage.removeItem('token');
			}
		},
	});
	const logInRef = useRef(logIn);

	useEffect(() => {
		logInRef.current();
	}, []);

	if (!viewer.didRequest && !error) {
		return (
			<Layout className='app-skeleton'>
				<AppHeaderSkeleton />
				<div className='app-skeleton__spin-section'>
					<Spin size='large' tip='Launching TinyHouse' />
				</div>
			</Layout>
		);
	}

	const logInErrorBannerElement = error ? (
		<ErrorBanner description="We weren't able to verify if you were logged in. Please try again later!" />
	) : null;

	return (
		<Router>
			<Layout id='app'>
				{logInErrorBannerElement}
				<Affix offsetTop={0} className='app__affix-header'>
					<AppHeader viewer={viewer} setViewer={setViewer} />
				</Affix>
				<Routes>
					<Route path='/'>
						<Route index element={<Home />} />
						<Route path='host' element={<Host />} />
						<Route path='listing/:id' element={<Listing />} />
						<Route path='listings'>
							<Route index element={<Listings />} />
							<Route path=':location' element={<Listings />} />
						</Route>
						<Route path='user/:id' element={<User viewer={viewer} />} />
						<Route path='login' element={<Login setViewer={setViewer} />} />
					</Route>
					<Route path='*' element={<NotFound />} />
				</Routes>
			</Layout>
		</Router>
	);
};

root.render(
	<ApolloProvider client={client}>
		<App />
	</ApolloProvider>
);

reportWebVitals();
