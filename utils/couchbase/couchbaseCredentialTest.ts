import { connect, type Cluster } from 'couchbase';
import type { ICredentialTestFunctions } from 'n8n-workflow';

export async function couchbaseCredentialTest(this: ICredentialTestFunctions, credential: any) {
	const credentials = credential.data ?? {};
	let cluster: Cluster | undefined;

	try {
		cluster = await connect(credentials.couchbaseConnectionString as string, {
			username: credentials.couchbaseUsername as string,
			password: credentials.couchbasePassword as string,
			timeouts: { connectTimeout: 5000 },
		});
		await cluster.ping();

		return {
			status: 'OK' as const,
			message: 'Connection successful',
		};
	} catch (error: any) {
		return {
			status: 'Error' as const,
			message: `Connection failed: ${error.message}`,
		};
	} finally {
		await cluster?.close();
	}
}
