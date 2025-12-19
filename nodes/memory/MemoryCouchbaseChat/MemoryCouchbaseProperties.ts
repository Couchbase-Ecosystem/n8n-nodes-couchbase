import {INodeProperties} from 'n8n-workflow';

export const couchbaseBucketRL: INodeProperties = {
	displayName: 'Couchbase Bucket',
	name: 'couchbaseBucket',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'populateCouchbaseBucketRL',
			},
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. n8n_memory',
		},
	],
};

export const couchbaseScopeRL: INodeProperties = {
	displayName: 'Couchbase Scope',
	name: 'couchbaseScope',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	typeOptions: {
		loadOptionsDependsOn: ['couchbaseBucket.value'],
	},
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'populateCouchbaseScopeRL',
			},
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. my_scope',
		},
	],
};

export const couchbaseCollectionRL: INodeProperties = {
	displayName: 'Couchbase Collection',
	name: 'couchbaseCollection',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	typeOptions: {
		loadOptionsDependsOn: ['couchbaseBucket.value', 'couchbaseScope.value'],
	},
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'populateCouchbaseCollectionRL',
			},
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. _default',
		},
	],
};
