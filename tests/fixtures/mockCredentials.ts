export const mockCouchbaseCredentials = {
	couchbaseConnectionString: 'couchbase://localhost',
	couchbaseUsername: 'testuser',
	couchbasePassword: 'testpassword',
};

export const mockCouchbaseSecureCredentials = {
	couchbaseConnectionString: 'couchbases://secure-host.example.com',
	couchbaseUsername: 'secureuser',
	couchbasePassword: 'securepassword',
};

export const mockInvalidCredentials = {
	couchbaseConnectionString: 'invalid://localhost',
	couchbaseUsername: '',
	couchbasePassword: '',
};
