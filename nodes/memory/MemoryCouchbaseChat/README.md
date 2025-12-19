# n8n-nodes-couchbase: Couchbase Chat Memory

The Couchbase Chat Memory node is an n8n community node contained within the `n8n-nodes-couchbase` package. It lets you store and manage chat conversation history in Couchbase for use with AI workflows in n8n.

Couchbase Chat Memory provides persistent storage for conversational AI applications, allowing agents and chains to maintain context across multiple interactions by storing message history in a Couchbase collection.

[Installation](#installation)  
[Functionality](#functionality)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Functionality

The Couchbase Chat Memory node operates as a memory provider for AI agents and chains. It automatically stores and retrieves conversation history, enabling your AI workflows to maintain context across multiple messages and sessions.

**Key Features**:
- **Persistent Storage**: Chat histories are stored in Couchbase collections and persist across workflow executions
- **Session Management**: Support for both automatic and manual session ID management
- **Context Window Control**: Configure how many previous messages to include in the conversation context
- **Flexible Storage**: Store conversations in any Couchbase bucket, scope, and collection

## Credentials

To use the Couchbase Chat Memory node, you'll need to set up Couchbase credentials in n8n:

1. **Prerequisites**:

	- A running Couchbase cluster (using [Couchbase Capella](https://cloud.couchbase.com/) in the cloud, or Couchbase Server)
	- [Database credentials](https://docs.couchbase.com/cloud/clusters/manage-database-users.html#create-database-credentials) with appropriate permissions for the operations you want to perform
	- [Allow IP address](https://docs.couchbase.com/cloud/clusters/allow-ip-address.html) for your n8n instance

2. **Credential Parameters**:
	- **Connection String**: The connection string to your Couchbase server (e.g., `couchbase://localhost` or `couchbases://<hostname>`)
	- **Username**: Database access username
	- **Password**: Database access password

## Compatibility

This node has been tested with n8n version 1.123.4.

## Usage

### Basic Configuration

The Couchbase Chat Memory node is designed to be connected to AI Agent nodes to provide conversation memory. Here's how to configure it:

1. **Add the Node**: Drag the Couchbase Chat Memory node into your workflow
2. **Select Credentials**: Choose your Couchbase credentials
3. **Configure Storage Location**:
	- **Bucket Name**: Select the bucket where chat histories will be stored
	- **Scope Name**: Select the scope (or use `_default`)
	- **Collection Name**: Select the collection (or use `_default`)
4. **Connect to AI Agent**: Connect the Memory output to an AI Agent node's Memory input

### Session Management

The node offers two approaches for managing conversation sessions:

#### Automatic Session ID (Recommended)

By default, the node uses **Automatic** session ID mode, which uses the unique session ID for a given chat conversation.

To use automatic session IDs:
1. Set **Session ID** to `Automatic`
2. Each conversation will create a new session

#### Manual Session ID

For custom situations requiring persistent conversations across multiple workflow executions, use **Manual** session ID mode:

1. Set **Session ID** to `Define Below`
2. Enter your session identifier in the **Session Key** field
	- Use static values like `user-123` for user-specific conversations
	- Use expressions like `{{ $json.userId }}` to dynamically set the session based on input data
	- Use expressions like `{{ $('Webhook').item.json.query.sessionId }}` to use session IDs from webhook parameters

### Context Window Length

The **Context Window Length** parameter controls how many previous messages are included in the conversation context:

1. **Default Value**: 5 messages (the last 5 messages from the conversation)
2. **Recommended Range**: 5-20 messages
3. **Considerations**:
	- Smaller values (5-10): Faster, lower token usage, more focused on recent context
	- Larger values (15-20): Better long-term context, higher token usage

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Couchbase Documentation](https://docs.couchbase.com/)
- [n8n AI Nodes Documentation](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/)
