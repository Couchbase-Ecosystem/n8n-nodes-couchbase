import {
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CouchbaseApi implements ICredentialType {
	name = 'couchbaseApi';
	displayName = 'Couchbase Credentials API';
	documentationUrl =
		'https://github.com/Couchbase-Ecosystem/n8n-nodes-couchbase?tab=readme-ov-file#credentials';
	icon: Icon = {
		light: 'file:../nodes/Couchbase/couchbase.svg',
		dark: 'file:../nodes/Couchbase/couchbase.dark.svg',
	};
	properties: INodeProperties[] = [
		{
			displayName: 'Connection String',
			name: 'couchbaseConnectionString',
			type: 'string',
			default: '',
			placeholder: 'couchbase://localhost or couchbases://hostname',
			description:
				'The Couchbase connection string. Use couchbase:// for unencrypted or couchbases:// for TLS connections.',
			required: true,
		},
		{
			displayName: 'Username',
			name: 'couchbaseUsername',
			type: 'string',
			default: '',
			placeholder: 'Enter your Couchbase username',
			description: 'The username for Couchbase authentication',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'couchbasePassword',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: 'Enter your Couchbase password',
			description: 'The password for Couchbase authentication',
			required: true,
		},
	];

	// Credential test to verify connection works
	test: ICredentialTestRequest = {
		request: {
			// This triggers a connection test when saving credentials
			// The actual test is performed in the node's connection logic
			baseURL: '={{$credentials.couchbaseConnectionString}}',
			url: '',
			skipSslCertificateValidation: true,
		},
	};
}
