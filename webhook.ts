import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { App, LogLevel } from '@slack/bolt'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ErrorCode,
    McpError
} from '@modelcontextprotocol/sdk/types.js'
import * as fs from 'fs'

function diskLog(message: string) {
    fs.appendFileSync('./slack-debug.log', `[${new Date().toISOString()}] ${message}\n`)
}


// Create the MCP server and declare it as a channel
const mcp = new Server(
    { name: 'webhook', version: '0.0.1' },
    {
        // this key is what makes it a channel — Claude Code registers a listener for it
        capabilities: {
            experimental: { 'claude/channel': {} },
            tools: {}
        },
        // added to Claude's system prompt so it knows how to handle these events
        instructions: 'Events from the webhook channel arrive as <channel source="webhook" ...>. You can reply to the user in Slack using the `send_slack_message` tool. Use the `channel` ID provided in the incoming message metadata.',
    },
)

// Declare the Slack tool so Claude knows it exists
mcp.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'send_slack_message',
                description: 'Send a message to a Slack channel. Use this to reply to webhook channel incoming messages from Slack.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        channel: {
                            type: 'string',
                            description: 'The Slack channel ID to send the message to (e.g. C0AMZUV0JTZ)'
                        },
                        text: {
                            type: 'string',
                            description: 'The markdown text reply to send to Slack'
                        }
                    },
                    required: ['channel', 'text']
                }
            }
        ]
    }
})

// Execute the Slack tool when Claude calls it
mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'send_slack_message') {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`)
    }

    const { channel, text } = request.params.arguments as any
    if (!channel || !text) {
        throw new McpError(ErrorCode.InvalidParams, 'channel and text are required')
    }

    try {
        diskLog(`Sending message back to Slack channel ${channel}...`)
        await app.client.chat.postMessage({
            channel,
            text,
        })
        diskLog('Message sent successfully!')
        return {
            content: [{ type: 'text', text: 'Message successfully sent to Slack.' }]
        }
    } catch (error: any) {
        diskLog(`Error sending slack message: ${error}`)
        return {
            content: [{ type: 'text', text: `Failed to send to Slack: ${error.message}` }],
            isError: true
        }
    }
})

// Connect to Claude Code over stdio (Claude Code spawns this process)
// We need to wait for MCP connection before starting Slack to guarantee we don't miss events
await mcp.connect(new StdioServerTransport())

// Initialize the Slack Bolt App in Socket Mode
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
    // Bolt requires signingSecret even in Socket Mode, we provide a fallback dummy
    signingSecret: process.env.SLACK_SIGNING_SECRET || 'dummy-secret',
    // MUST write logs to stderr, or else it corrupts the MCP stdio protocol
    logger: {
        debug: (...msgs) => console.error('[Slack DEBUG]', ...msgs),
        info: (...msgs) => console.error('[Slack INFO]', ...msgs),
        warn: (...msgs) => console.error('[Slack WARN]', ...msgs),
        error: (...msgs) => console.error('[Slack ERROR]', ...msgs),
        setLevel: () => { },
        getLevel: () => LogLevel.DEBUG,
        setName: () => { }
    }
})

// Listen for all messages in channels the bot is invited to
app.message(async ({ message, say }) => {
    diskLog(`Received message event from channel ${message.channel}: ${JSON.stringify(message)}`)

    // Ignore messages from bots to prevent loops
    if (message.subtype && message.subtype === 'bot_message') return

    try {
        const text = (message as any).text || ''

        await mcp.notification({
            method: 'notifications/claude/channel',
            params: {
                content: text,  // becomes the body of the <channel> tag
                // these metadata keys become attributes on the <channel> tag
                meta: {
                    channel: message.channel,
                    user: (message as any).user || 'unknown',
                    type: 'slack_message'
                },
            },
        })
        diskLog(`Successfully forwarded to MCP! -> ${text.slice(0, 30)}...`)
    } catch (error) {
        diskLog(`MCP Error: ${error}`)
        console.error('Error forwarding message to MCP:', error)
    }
})

// Log startup locally (goes to stderr so it doesn't break StdioServerTransport)
app.start().then(() => {
    diskLog('APP STARTED: ⚡️ Slack Socket Mode Connected Successfully!')
    console.error('⚡️ Slack MCP Receiver is running in Socket Mode!')
}).catch((error) => {
    diskLog(`APP FAILED: ${error}`)
    console.error('Failed to start Slack App:', error)
})