import stripe from 'stripe';

const client = new stripe(`${process.env.S_SECRET_KEY}`, {
	apiVersion: '2022-08-01',
	typescript: true,
});

export const Stripe = {
	connect: async (code: string) => {
		const response = await client.oauth.token({
			grant_type: 'authorization_code',
			code,
		});

		return response;
	},
	charge: async (amount: number, source: string, stripeAccount: string) => {
		const res = await client.charges.create(
			{
				amount,
				currency: 'usd',
				source,
				application_fee_amount: Math.round(amount * 0.05),
			},
			{
				stripeAccount,
			}
		);

		if (res.status !== 'succeeded') {
			throw new Error('failed to create charge with Stripe');
		}
	},
};
