# n8n-nodes-couchbase: Couchbase Search Vector Store

The Couchbase Search Vector Store node is an n8n community node contained within the `n8n-nodes-couchbase` package. It lets you use Couchbase Search Vector Store in your n8n workflows.

Couchbase Search Vector Store is an implementation of Vector Search using the **Couchbase Search Service**.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

This Vector Store node has five modes: Get Many, Update Documents, Insert Documents, Retrieve Documents (As Vector Store for Chain/Tool), and Retrieve Documents (As Tool for AI Agent). The mode you select determines the operations you can perform with the node and what inputs and outputs are available.

- **Get Many**: In this mode, you can retrieve multiple documents from your vector database by providing a prompt. The prompt will be embedded and used for similarity search. The node will return the documents that are most similar to the prompt with their similarity score. This is useful if you want to retrieve a list of similar documents and pass them to an agent as additional context.

- **Update Documents**: Use Update Documents mode to update a document in your vector database by ID.

- **Insert Documents**: Use Insert Documents mode to insert new documents into your vector database.

- **Retrieve Documents (As Vector Store for Chain/Tool)**: Use Retrieve Documents (As Vector Store for Chain/Tool) mode with a vector-store retriever to retrieve documents from a vector database and provide them to the retriever connected to a chain. In this mode you must connect the node to a retriever node or root node.

- **Retrieve Documents (As Tool for AI Agent)**: Use Retrieve Documents (As Tool for AI Agent) mode to use the vector store as a tool resource when answering queries. When formulating responses, the agent uses the vector store when the vector store name and description match the question details.

## Credentials

To use the Couchbase Search Vector Store node, you'll need to set up Couchbase credentials in n8n:

1. **Prerequisites**:

   - A running Couchbase cluster (using [Couchbase Capella](https://cloud.couchbase.com/) in the cloud, or Couchbase Server)
   - [Database credentials](https://docs.couchbase.com/cloud/clusters/manage-database-users.html#create-database-credentials) with appropriate permissions for the operations you want to perform
   - [Allow IP address](https://docs.couchbase.com/cloud/clusters/allow-ip-address.html) for your n8n instance

2. **Credential Parameters**:
   - **Connection String**: The connection string to your Couchbase server (e.g., `couchbase://localhost`)
   - **Username**: Database access username
   - **Password**: Database access password

## Compatibility

This node has been tested with n8n version 1.123.4.

**Note: ** in version 1.2.0 of `n8n-nodes-couchbase`, the versioning for the Couchbase Search Vector Store node was adjusted to use integers (e.g., 1, 2) instead of decimal versions (e.g., 1.0, 1.1) to align with n8n's versioning conventions for community nodes. This means that some workflows using earlier versions of the node may require updates to work with the latest version. Simply re-select the affected node(s) from the node panel and replace them in your workflow to ensure compatibility.

## Usage

### Configuring Couchbase Details (for all node operations)

Each node requires some specific details about your Couchbase Cluster:

1. Select your Couchbase credentials.
2. Specify the **Bucket Name**, **Scope Name**, and **Collection Name**.
3. Toggle **Use Scoped Index** if your index is defined at the scope level.
4. Select a **Vector Index** configured in Couchbase Search.
5. Specify the **Text Field Key** (field containing the document text) and **Embedding Field Key** (field containing the vector embeddings).

#### Get Many

This operation retrieves documents from your Couchbase collection based on their similarity to a given query.

1. Set the **Operation Mode** to `Get Many`.
2. Connect an **Embeddings** node (e.g., OpenAI Embeddings) to the input.
3. Configure the **Couchbase Details** (described above).
4. Enter your search Query in the **Prompt** field.
5. Optionally, set the **Limit** to limit the retrieved documents.
6. Optionally, define **Metadata Filters** to narrow down the search based on document metadata.
7. Execute the node. It will output the top K documents most similar to your query, along with their similarity scores.

#### Update Documents

This operation allows you to update existing documents in your Couchbase collection. The input data should contain the document IDs and the updated content or metadata.

1. Set the **Operation Mode** to `Update Documents`.
2. Connect an **Embeddings** node (e.g., OpenAI Embeddings). If the document content (`pageContent`) is updated, it will be re-embedded.
3. Connect an input node providing a document content to update. A single document per item is expected. A **Split Out** node can be used to ensure only one document is being passed in.
4. Configure the **Couchbase Details** (described above).
5. Specify the **ID** which corresponds to the existing document you'd like to update content for.
6. Execute the node. It will attempt to update the specified documents in Couchbase.

#### Insert Documents

This operation adds new documents to your Couchbase collection.

1. Set the **Operation Mode** to `Insert Documents`.
2. Connect an **Embeddings** node.
3. Connect a **Document Loader** node (e.g., Default Data Loader with Recursive Character Text Splitter) to the 'Documents' input.
4. Configure the **Couchbase Details** (described above).
5. Optionally, under **Options**, you can configure **Add Vector Options**:
   - **IDs**: Provide a comma-separated list of custom IDs for the documents being inserted. They will be applied in the order of insertion.
   - **Metadata**: Provide a JSON array representing metadata (in order of document insertion, as with the IDs above) to be added to documents being inserted in this batch.
6. Execute the node. The input documents will be embedded and inserted into the specified Couchbase collection.

#### Retrieve Documents (As Vector Store for Chain/Tool)

This operation makes the configured Couchbase Vector Store available for use with other AI nodes like Retrievers or Chains (e.g., Retrieval QA Chain).

1. Set the **Operation Mode** to `Retrieve Documents (As Vector Store for Chain/Tool)`.
2. Connect an **Embeddings** node.
3. Configure the **Couchbase Details** (described above).
4. Optionally, set default retrieval parameters under **Options**:
   - **Number of Results (K)**: Default number of documents to retrieve.
   - **Metadata Filters** or **Search Filter JSON**: Default filters to apply during retrieval.
5. Connect the output (**Vector Store**) of this node to the 'Vector Store' input of a compatible AI node (e.g., Vector Store Retriever, which in turn is connected to a Question and Answer Chain). The connected node (Q&A Chain, in this case) will trigger the actual document retrieval when it executes.

### 5. Retrieve Documents (As Tool for AI Agent)

This operation configures the Couchbase Vector Store as a Tool that an AI Agent can use to answer questions.

1. Set the **Operation Mode** to `Retrieve Documents (As Tool for AI Agent)`.
2. Connect an **Embeddings** node.
3. Configure the **Couchbase Details** (described above).
4. Provide a Tool **Name** (e.g., `couchbase_document_search`).
5. Provide a Tool **Description** that clearly explains what the tool does and when the agent should use it (e.g., "Use this tool to search for relevant documents in the Couchbase knowledge base about topic X").
6. Optionally, define **Metadata Filters** to narrow down the search based on document metadata.
7. Connect the output (**AI Tool**) of this node to the 'Tools' input of an Agent node (e.g., AI Agent). The agent will decide when to use this tool based on the user's query and the tool description.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Couchbase Documentation](https://docs.couchbase.com/)
- [Couchbase LangChain Documentation](https://js.langchain.com/docs/integrations/document_loaders/web_loaders/couchbase/)
- [Couchbase Vector Search Documentation](https://docs.couchbase.com/server/current/vector-search/vector-search.html)
- [Create a Vector Search Index](https://docs.couchbase.com/server/current/vector-search/create-vector-search-index-ui.html)
