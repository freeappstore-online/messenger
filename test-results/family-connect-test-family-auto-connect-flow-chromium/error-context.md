# Page snapshot

```yaml
- text: "[plugin:vite:esbuild] Transform failed with 1 error: /Users/serge/dev/famchat/family-chat-poc/src/rtc/p2pManager2.ts:127:15: ERROR: Expected \")\" but found \":\" /Users/serge/dev/famchat/family-chat-poc/src/rtc/p2pManager2.ts:127:15 Expected \")\" but found \":\" 125| * @returns true if the message was sent, false otherwise 126| */ 127| sendTo(peerId: string, message: string | Uint8Array | ArrayBuffer): boolean { | ^ 128| const sanitizedPeerId = sanitizeId(peerId); 129| const channel = this.dataChannels.get(sanitizedPeerId); at failureErrorWithLog (/Users/serge/dev/famchat/family-chat-poc/node_modules/esbuild/lib/main.js:1467:15) at /Users/serge/dev/famchat/family-chat-poc/node_modules/esbuild/lib/main.js:736:50 at responseCallbacks.<computed> (/Users/serge/dev/famchat/family-chat-poc/node_modules/esbuild/lib/main.js:603:9) at handleIncomingPacket (/Users/serge/dev/famchat/family-chat-poc/node_modules/esbuild/lib/main.js:658:12) at Socket.readFromStdout (/Users/serge/dev/famchat/family-chat-poc/node_modules/esbuild/lib/main.js:581:7) at Socket.emit (node:events:524:28) at addChunk (node:internal/streams/readable:561:12) at readableAddChunkPushByteMode (node:internal/streams/readable:512:3) at Readable.push (node:internal/streams/readable:392:5) at Pipe.onStreamRead (node:internal/stream_base_commons:191:23) Click outside, press Esc key, or fix the code to dismiss. You can also disable this overlay by setting"
- code: server.hmr.overlay
- text: to
- code: "false"
- text: in
- code: vite.config.ts
- text: .
```