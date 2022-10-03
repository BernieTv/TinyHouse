import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { useParams } from 'react-router-dom';
import { Col, Layout, Row } from 'antd';
import { Moment } from 'moment';

import { LISTING } from '../../lib/graphql/queries';
import {
	Listing as ListingData,
	ListingVariables,
} from '../../lib/graphql/queries/Listing/__generated__/Listing';
import { ErrorBanner, PageSkeleton } from '../../lib/components';
import { Viewer } from '../../lib/types';
import {
	ListingBookings,
	ListingCreateBooking,
	ListingCreateBookingModal,
	ListingDetails,
} from './components';

interface Props {
	viewer: Viewer;
}

const { Content } = Layout;
const PAGE_LIMIT = 3;

export const Listing = ({ viewer }: Props) => {
	const [bookingsPage, setBookingsPage] = useState(1);
	const [checkInDate, setCheckInDate] = useState<Moment | null>(null);
	const [checkOutDate, setCheckOutDate] = useState<Moment | null>(null);
	const [modalVisible, setModalVisible] = useState(false);

	const { id } = useParams() as { id: string };
	const { data, loading, error } = useQuery<ListingData, ListingVariables>(LISTING, {
		variables: { id, bookingsPage, limit: PAGE_LIMIT },
	});

	if (loading) {
		return (
			<Content className='listings'>
				<PageSkeleton />
			</Content>
		);
	}

	if (error) {
		return (
			<Content className='listings'>
				<ErrorBanner description="This listing may not exist or we've encountered an error. Please try again soon." />
				<PageSkeleton />
			</Content>
		);
	}

	const listing = data ? data.listing : null;
	const listingBookings = listing ? listing.bookings : null;

	const listingDetailsElement = listing ? <ListingDetails listing={listing} /> : null;

	const listingBookingsElement = listingBookings ? (
		<ListingBookings
			listingBookings={listingBookings}
			bookingsPage={bookingsPage}
			limit={PAGE_LIMIT}
			setBookingsPage={setBookingsPage}
		/>
	) : null;

	const listingCreateBookingElement = listing ? (
		<ListingCreateBooking
			viewer={viewer}
			host={listing.host}
			price={listing.price}
			bookingsIndex={listing.bookingsIndex}
			checkInDate={checkInDate}
			checkOutDate={checkOutDate}
			setCheckInDate={setCheckInDate}
			setCheckOutDate={setCheckOutDate}
			setModalVisible={setModalVisible}
		/>
	) : null;

	const listingCreateBookingModalElement =
		listing && checkInDate && checkOutDate ? (
			<ListingCreateBookingModal
				price={listing.price}
				modalVisible={modalVisible}
				checkInDate={checkInDate}
				checkOutDate={checkOutDate}
				setModalVisible={setModalVisible}
			/>
		) : null;

	return (
		<Content className='listings'>
			<Row gutter={24} typeof='flex' justify='space-between'>
				<Col xs={24} lg={14}>
					{listingDetailsElement}
					{listingBookingsElement}
				</Col>
				<Col xs={24} lg={10}>
					{listingCreateBookingElement}
				</Col>
			</Row>
			{listingCreateBookingModalElement}
		</Content>
	);
};
