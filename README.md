# Claude Code Slack Channel

Connect Claude Code to your Slack workspace using the Model Context Protocol (MCP). This server runs a Slack App in Socket Mode that routes incoming messages from Slack directly into your local Claude Code session, and gives Claude the ability to securely reply back!

## Features

- **Two-Way Communication**: Send messages from Slack to Claude Code, and allow Claude Code to natively reply using an MCP tool (`send_slack_message`).
- **Zero Configuration Tunnels**: Uses Slack Socket Mode, meaning no `ngrok` or public IP addresses are required. Runs completely locally!
- **Private Channel Support**: Fully supports routing messages from private Slack channels.

## Setup Instructions

### 1. Create a Slack App
1. Go to [Slack API Apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**.
2. Go to **Socket Mode** (left sidebar) and toggle it **On**.
3. Generate an **App-Level Token** with the `connections:write` scope. *(Starts with `xapp-`)*.
4. Go to **OAuth & Permissions** (left sidebar), scroll to **Scopes > Bot Token Scopes**, and add the `channels:history`, `chat:write`, and `groups:history` scopes.
5. Go to **Event Subscriptions** (left sidebar), toggle **Enable Events** to **On**, and subscribe to `message.channels` and `message.groups` under "Subscribe to bot events".
6. **Important**: Scroll to the bottom and click **Save Changes**.
7. Go to **Install App** and install it into your workspace to get your **Bot User OAuth Token** *(Starts with `xoxb-`)*.

### 2. Configure Claude Code
You can add this MCP server to your global Claude Code configuration (`~/.claude.json`) or to a project-specific `.claude.json` configuration. 

Run `npm install` in this directory to install the `@slack/bolt` and `tsx` dependencies. Then, add the following to your `mcpServers` block, replacing the path and tokens with your actual values:

```json
{
  "mcpServers": {
    "slack-channel": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "tsx",
        "/path/to/this/repository/webhook.ts"
      ],
      "env": {
        "SLACK_APP_TOKEN": "xapp-...",
        "SLACK_BOT_TOKEN": "xoxb-..."
      }
    }
  }
}
```

### 3. Usage
- Simply restart Claude Code. The server will initialize in the background and connect to Slack.
- Invite your bot to any channel in Slack using `/invite @YourBotName`.
- Send a message in that channel, and it will seamlessly appear in Claude Code as context!
- You can ask Claude Code directly to "Reply to that Slack message" and it will autonomously use the `send_slack_message` tool to post back.

## Troubleshooting
If messages aren't arriving:
- Ensure you have invited the bot to the channel.
- Ensure you clicked the yellow "Reinstall to Workspace" banner in Slack after changing event scopes.
- Check the `slack-debug.log` file generated in the root of this repository.
