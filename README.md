# n8n-nodes-couchbase

This is a collection of n8n community nodes for using Couchbase services within n8n workflows.

Couchbase is a distributed NoSQL cloud database that offers the robustness of a relational database with the flexibility of a JSON document database, featuring key-value operations, SQL++ querying, and powerful search capabilities including vector search.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Nodes](#nodes)
[Installation](#installation)
[Credentials](#credentials)  
[Compatibility](#compatibility)  

## Nodes
Click on the node name to view its detailed documentation.
- [**Couchbase**](nodes/Couchbase/README.md): This node allows you to perform operations on The Couchbase KV, Query, and Search services. It supports creating, reading, updating, and deleting documents, as well as executing SQL++ queries and full-text searches.
- [**Couchbase Search Vector Store**](nodes/vector_store/VectorStoreCouchbaseSearch/README.md): This node allows you to perform vector search operations using the Couchbase Search Service. It supports retrieving, updating, and inserting documents in a vector database, as well as using the vector store as a tool for AI agents.
- [**Couchbase Query Vector Store**](nodes/vector_store/VectorStoreCouchbaseQuery/README.md): This node performs vector similarity search using the Couchbase Query service and SQL++ vector indexes. **Requires Couchbase Server 8.0 or newer.**
- [**Couchbase Chat Memory**](nodes/memory/MemoryCouchbaseChat/README.md): This node provides persistent storage for conversational AI applications by storing chat conversation history in a Couchbase database. It enables AI agents and chains to maintain context across multiple interactions.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Credentials

To use the Couchbase node, you'll need to set up Couchbase credentials in n8n:

1. **Prerequisites**:
	- A running Couchbase cluster (using [Couchbase Capella](https://cloud.couchbase.com/) in the cloud, or Couchbase Server)
	- [Database credentials](https://docs.couchbase.com/cloud/clusters/manage-database-users.html#create-database-credentials) with appropriate permissions for the operations you want to perform
   - [Allow IP address](https://docs.couchbase.com/cloud/clusters/allow-ip-address.html) for your n8n instance

2. **Credential Parameters**:
	- **Connection String**: The connection string to your Couchbase server (e.g., `couchbase://localhost`)
	- **Username**: Database access username
	- **Password**: Database access password

## Compatibility

### n8n

These nodes have been tested with n8n version 2.39.7.

### Couchbase Server

| Node | Minimum Couchbase Server |
| --- | --- |
| Couchbase (KV / Query / Search) | 7.6 |
| Couchbase Search Vector Store | 7.6 |
| Couchbase Chat Memory | 7.6 |
| **Couchbase Query Vector Store** | **8.0** |

The Couchbase Query Vector Store node builds SQL++ around the `APPROX_VECTOR_DISTANCE`
function, which was introduced in Couchbase Server 8.0. On 7.6.x the function does not
exist and the node fails with `ParsingFailureError: parsing failure`, which does not
explain the cause — if you see that error, check your server version first.

Couchbase Capella clusters running 8.0 or later satisfy this requirement.

