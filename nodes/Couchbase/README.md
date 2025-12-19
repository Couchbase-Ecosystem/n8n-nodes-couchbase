# n8n-nodes-couchbase: Couchbase

The Couchbase node is an n8n community node contained within the `n8n-nodes-couchbase` package. It lets you use the Couchbase KV, Query, and Search services in your n8n workflows.

Couchbase is a distributed NoSQL cloud database that offers the robustness of a relational database with the flexibility of a JSON document database, featuring key-value operations, SQL++ querying, and powerful search capabilities.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

The Couchbase node supports operations across two main resources:

### Document & Key-Value Operations

- **Create**: Insert a document with a specified or auto-generated ID
- **Query**: Execute SQL++ queries to retrieve or manipulate documents
- **Read**: Retrieve a document by its ID
- **Upsert**: Modify an existing document identified by its ID, or create a new one if it does not exist
- **Delete**: Remove a document by its ID

### Search Operations

- **Create Index**: Create a new search index
- **Search & Retrieve**: Perform full-text search with multiple options:
  - Basic search with query, fields, and limit
  - Advanced mode with raw JSON query capabilities

## Credentials

To use the Couchbase node, you'll need to set up Couchbase credentials in n8n:

1. **Prerequisites**:

   - A running Couchbase cluster (using [Couchbase Capella](https://cloud.couchbase.com/) in the cloud, or Couchbase Server)
   - [Database credentials](https://docs.couchbase.com/cloud/clusters/manage-database-users.html#create-database-credentials) with appropriate permissions for the operations you want to perform
   - [Allow IP address](https://docs.couchbase.com/cloud/clusters/allow-ip-address.html) for your n8n instance

2. **Credential Parameters**:
   - **Connection String**: The connection string to your Couchbase server (e.g., `couchbases://<hostname>`)
   - **Username**: Database access username
   - **Password**: Database access password

## Compatibility

This node has been tested with n8n version 1.123.4.

**Note: ** in version 1.2.0 of `n8n-nodes-couchbase`, the versioning for the Couchbase node was adjusted to use integers (e.g., 1, 2) instead of decimal versions (e.g., 1.0, 1.1) to align with n8n's versioning conventions for community nodes. This means that some workflows using earlier versions of the node may require updates to work with the latest version. Simply re-select the affected node(s) from the node panel and replace them in your workflow to ensure compatibility.

## Usage

### Document Operations

#### Creating Documents

1. Select the **Document & Key-Value** resource
2. Choose the **Create** operation
3. Select your target bucket, scope, and collection
4. You can either:
   - Use a generated UUID for your document
   - Specify your own document ID
5. Enter your document content in JSON format

#### Reading Documents

1. Select the **Document & Key-Value** resource
2. Choose the **Read** operation
3. Select your target bucket, scope, and collection
4. Enter the document ID to retrieve
5. The node will return the document content if found

#### Upserting Documents

1. Select the **Document & Key-Value** resource
2. Choose the **Upsert** operation
3. Select your target bucket, scope, and collection
4. Enter the document ID
5. Provide the new JSON document content
6. The document will be created if it doesn't exist, or updated if it does

#### Deleting Documents

1. Select the **Document & Key-Value** resource
2. Choose the **Delete** operation
3. Select your target bucket, scope, and collection
4. Enter the document ID to delete
5. The node will remove the document from the collection

#### Querying Documents with SQL++

1. Select the **Document & Key-Value** resource
2. Choose the **Query** operation
3. Optionally select a bucket and scope context
4. Enter your SQL++ query
   ```sql
   SELECT * FROM `travel-sample`.inventory.hotel WHERE country = "United States"
   ```

### Search Operations

#### Full-Text Search

1. Select the **Search** resource
2. Choose the **Search & Retrieve** operation
3. Enter the index name (format: `bucket.scope.index-name`)
4. Enter your search query
5. Configure optional parameters:
   - Fields to return (comma-separated)
   - Results limit
   - Include term locations option

#### Advanced Search

1. Enable **Advanced Mode**
2. Enter a raw JSON query for more complex search requirements:
   ```json
   {
   	"query": {
   		"match": "California"
   	},
   	"size": 5,
   	"from": 0
   }
   ```

#### Creating Search Indexes

1. Select the **Search** resource
2. Choose the **Create Index** operation
3. Enter the index definition as a JSON object

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Couchbase Documentation](https://docs.couchbase.com/)
- [Couchbase Node.js SDK](https://docs.couchbase.com/nodejs-sdk/current/hello-world/start-using-sdk.html)
- [Couchbase Search Service](https://docs.couchbase.com/server/current/search/search-intro.html)
