# Couchbase Query Vector Store Node

This n8n node provides integration with Couchbase's Query Vector Store, enabling vector similarity search using SQL++ and the Query service.

## Overview

The Couchbase Query Vector Store node allows you to:

- **Insert** documents with vector embeddings into Couchbase
- **Retrieve** similar documents using vector similarity search via SQL++
- **Load** existing documents from Couchbase for AI operations
- **Update** documents in the vector store
- **Retrieve as Tool** for use with AI agents

## Key Differences from Search Vector Store

| Feature          | Query Vector Store          | Search Vector Store          |
| ---------------- | --------------------------- | ---------------------------- |
| Index Type       | SQL++ vector index          | Full-Text Search (FTS) index |
| Service Used     | Query Service               | Search Service               |
| Index Scope      | Always scoped to collection | Can be global or scoped      |
| Distance Metrics | DOT, L2, COSINE             | Defined in FTS index         |

## Configuration

### Required Fields

- **Couchbase Bucket**: The bucket containing your data
- **Couchbase Scope**: The scope within the bucket
- **Couchbase Collection**: The collection to store/retrieve vectors
- **Distance Strategy**: The distance metric for similarity search
  - `DOT` - Dot product (default)
  - `EUCLIDEAN` - Euclidean (also known as L2) distance
  - `EUCLIDEAN_SQUARED` - Euclidean Squared (also known as L2 Squared) distance
  - `COSINE` - Cosine similarity
- **Embedding Field Key**: The document field storing the vector embeddings
- **Text Field Key**: The document field storing the raw text content

### Prerequisites

1. A Couchbase cluster (8.0+) with the Query service enabled
2. A SQL++ vector index created on your collection

### Creating a SQL++ Vector Index

Before using this node, create a vector index on your collection:

```sql
CREATE INDEX my_vector_index
ON `bucket`.`scope`.`collection`(embedding VECTOR)
WITH { "dimension": 1536, "similarity": "DOT" }
```

Replace:

- `bucket`, `scope`, `collection` with your actual names
- `embedding` with your embedding field name
- `1536` with your embedding dimensions
- `DOT` with your preferred similarity metric (`DOT`, `L2`, or `COSINE`)

## Operation Modes

### Insert Mode

Adds new documents with their embeddings to the vector store.

**Options:**

- **IDs**: Comma-separated list of custom document IDs
- **Metadata**: JSON array of metadata objects for each document

### Retrieve Mode

Performs similarity search to find relevant documents.

**Options:**

- **Metadata Filter**: Filter results based on document metadata

### Load Mode

Loads documents from the vector store for use in AI workflows.

### Update Mode

Updates existing documents in the vector store.

### Retrieve as Tool Mode

Exposes the vector store as a tool for AI agents.

## Example Workflow

1. Connect an **Embeddings** node (e.g., OpenAI Embeddings)
2. Add the **Couchbase Query Vector Store** node
3. Configure credentials and collection details
4. Select the appropriate operation mode
5. Connect to your AI workflow

## Resources

- [Couchbase Vector Search Documentation](https://docs.couchbase.com/server/current/vector-search/vector-search.html)
- [SQL++ Vector Search](https://docs.couchbase.com/server/current/n1ql/n1ql-language-reference/vector-search.html)
- [LangChain.js CouchbaseQueryVectorStore](https://js.langchain.com/docs/integrations/vectorstores/couchbase)
