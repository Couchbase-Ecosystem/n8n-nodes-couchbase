import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CouchbaseApi implements ICredentialType {
	name = 'couchbaseApi';
	displayName = 'Couchbase Credentials API';
	documentationUrl =
		'https://github.com/Couchbase-Ecosystem/n8n-nodes-couchbase?tab=readme-ov-file#credentials';
	icon: Icon = {
		light: 'file:../nodes/icons/couchbase.svg',
		dark: 'file:../nodes/icons/couchbase.dark.svg',
	};
	properties: INodeProperties[] = [
		{
			displayName: 'Connection String',
			name: 'couchbaseConnectionString',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Username',
			name: 'couchbaseUsername',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Password',
			name: 'couchbasePassword',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
		},
	];
}
