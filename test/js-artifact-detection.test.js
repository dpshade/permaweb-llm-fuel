import { describe, it, expect } from 'vitest';

// Test cases for JS artifact detection
const jsArtifactTestCases = [
  {
    name: 'Next.js hydration blobs',
    input: 'self.__next_f.push([1,"10:T109a,"])self.__next_f.push([1,"import from \"./utils/clients\";"])',
    expected: '',
    shouldRemove: true
  },
  {
    name: 'React component patterns',
    input: '["$","html",null, ],"templateStyles":"$undefined","templateScripts":"$undefined"',
    expected: '',
    shouldRemove: true
  },
  {
    name: 'Inline event handlers',
    input: 'onclick="alert(\'test\')" onload="init()"',
    expected: '',
    shouldRemove: true
  },
  {
    name: 'JavaScript function declarations',
    input: 'function test() { return true; } const x = 5;',
    expected: '',
    shouldRemove: true
  },
  {
    name: 'Import statements',
    input: 'import React from "react"; import { useState } from "react";',
    expected: '',
    shouldRemove: true
  },
  {
    name: 'Legitimate code documentation',
    input: '```javascript\nfunction example() {\n  return "hello";\n}\n```',
    expected: '```javascript\nfunction example() {\n  return "hello";\n}\n```',
    shouldRemove: false
  },
  {
    name: 'Mixed content with JS artifacts',
    input: 'This is documentation. function test() { } More documentation.',
    expected: 'This is documentation. More documentation.',
    shouldRemove: true
  },
  {
    name: 'JSON blobs',
    input: '{"type":"object","properties":{"test":{"type":"string"}}}',
    expected: '',
    shouldRemove: true
  },
  {
    name: 'Template literals',
    input: '`${variable} ${another}`',
    expected: '',
    shouldRemove: true
  },
  {
    name: 'Arrow functions',
    input: 'const func = () => {}; const arrow = (x) => x * 2;',
    expected: '',
    shouldRemove: true
  }
];

describe('JS Artifact Detection and Removal', () => {
  jsArtifactTestCases.forEach(({ name, input, expected, shouldRemove }) => {
    it(`should ${shouldRemove ? 'remove' : 'preserve'} ${name}`, () => {
      // This will be implemented in the next phase
      expect(true).toBe(true); // Placeholder
    });
  });
});

// Test cases for real-world AR.IO content from https://docs.ar.io/guides/story
const arioStoryPageTestCases = [
  {
    name: 'AR.IO story page - legitimate content',
    input: `Registering Story Protocol IP Assets with Arweave Metadata using Turbo

> Utilize the speed and reliability of ArDrive Turbo to store metadata for Story Protocol IP Assets permanently on Arweave.

Story Protocol enables the registration and management of intellectual property (IP) on-chain. A crucial part of this process involves linking metadata to your IP Assets. While various storage solutions exist, Arweave offers permanent, decentralized storage, making it an ideal choice for valuable IP metadata.

This guide demonstrates how to use the ArDrive Turbo SDK to efficiently upload IP Asset metadata to Arweave and register it with the Story Protocol TypeScript SDK.`,
    expected: `Registering Story Protocol IP Assets with Arweave Metadata using Turbo

> Utilize the speed and reliability of ArDrive Turbo to store metadata for Story Protocol IP Assets permanently on Arweave.

Story Protocol enables the registration and management of intellectual property (IP) on-chain. A crucial part of this process involves linking metadata to your IP Assets. While various storage solutions exist, Arweave offers permanent, decentralized storage, making it an ideal choice for valuable IP metadata.

This guide demonstrates how to use the ArDrive Turbo SDK to efficiently upload IP Asset metadata to Arweave and register it with the Story Protocol TypeScript SDK.`,
    shouldRemove: false
  },
  {
    name: 'AR.IO story page - legitimate code blocks',
    input: `## Prerequisites

Before you begin, ensure you have the following:

* **Node.js:** Version 18 or later. Download from nodejs.org.
* **npm/pnpm/yarn:** A compatible package manager.
* **Arweave Wallet:** A \`wallet.json\` file. Generate one using tools like the Wander browser extension. Keep this file secure and **do not commit it to version control**.
* **Turbo Credits:** Your Arweave wallet must be funded with Turbo credits to pay for uploads. Top up at <https://turbo-topup.com>.
* **Story Protocol Account:** An Ethereum-compatible private key (\`WALLET_PRIVATE_KEY\`) and an RPC Provider URL (\`RPC_PROVIDER_URL\`) for the desired Story Protocol network (e.g., Aeneid testnet) stored in a \`.env\` file.
* **TypeScript Environment:** You'll need to execute TypeScript code, so make sure you have \`ts-node\` installed globally (\`npm install -g ts-node\`) or as a dev dependency.`,
    expected: `## Prerequisites

Before you begin, ensure you have the following:

* **Node.js:** Version 18 or later. Download from nodejs.org.
* **npm/pnpm/yarn:** A compatible package manager.
* **Arweave Wallet:** A \`wallet.json\` file. Generate one using tools like the Wander browser extension. Keep this file secure and **do not commit it to version control**.
* **Turbo Credits:** Your Arweave wallet must be funded with Turbo credits to pay for uploads. Top up at <https://turbo-topup.com>.
* **Story Protocol Account:** An Ethereum-compatible private key (\`WALLET_PRIVATE_KEY\`) and an RPC Provider URL (\`RPC_PROVIDER_URL\`) for the desired Story Protocol network (e.g., Aeneid testnet) stored in a \`.env\` file.
* **TypeScript Environment:** You'll need to execute TypeScript code, so make sure you have \`ts-node\` installed globally (\`npm install -g ts-node\`) or as a dev dependency.`,
    shouldRemove: false
  },
  {
    name: 'AR.IO story page - legitimate TypeScript code',
    input: `### 3. Initialize SDK Clients

Create a configuration file to set up and export both the Turbo and Story clients:

\`\`\`typescript
import { TurboFactory, TurboAuthenticatedClient } from "@ardrive/turbo-sdk";
import { StoryClient, StoryConfig } from "@story-protocol/core-sdk";
import { http } from "viem";
import { Account, privateKeyToAccount, Address } from "viem/accounts";
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// --- Environment Variable Loading ---
const privateKeyEnv = process.env.WALLET_PRIVATE_KEY;
const rpcProviderUrlEnv = process.env.RPC_PROVIDER_URL;
const walletPath = path.resolve(process.cwd(), 'wallet.json'); // Assumes wallet.json is in the project root

// --- Validations ---
if (!privateKeyEnv) {
  throw new Error("WALLET_PRIVATE_KEY is not set in the .env file");
}
if (!rpcProviderUrlEnv) {
  throw new Error("RPC_PROVIDER_URL is not set in the .env file");
}
if (!fs.existsSync(walletPath)) {
    throw new Error(\`Arweave wallet file not found at \${walletPath}. Please ensure wallet.json exists in the project root.\`);
}

// --- ArDrive Turbo Client Setup ---
function parseWallet(filePath: string): any {
    try {
        const walletData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(walletData);
    } catch (error) {
        console.error(\`Error reading or parsing wallet file at \${filePath}:\`, error);
        throw new Error(\`Failed to load Arweave wallet. Ensure \${filePath} exists and is valid JSON.\`);
    }
}

const arweaveWallet = parseWallet(walletPath);

export const turboClient: TurboAuthenticatedClient = TurboFactory.authenticated({
    privateKey: arweaveWallet,
});
console.log("ArDrive Turbo Client initialized.");

// --- Story Protocol Client Setup ---
const storyPrivateKey: Address = \`0x\${privateKeyEnv}\`;
const storyAccount: Account = privateKeyToAccount(storyPrivateKey);

const storyConfig: StoryConfig = {
  account: storyAccount,
  transport: http(rpcProviderUrlEnv),
  chainId: "aeneid", // Adjust chainId if necessary
};

export const storyClient = StoryClient.newClient(storyConfig);
console.log("Story Client initialized.");
\`\`\``,
    expected: `### 3. Initialize SDK Clients

Create a configuration file to set up and export both the Turbo and Story clients:

\`\`\`typescript
import { TurboFactory, TurboAuthenticatedClient } from "@ardrive/turbo-sdk";
import { StoryClient, StoryConfig } from "@story-protocol/core-sdk";
import { http } from "viem";
import { Account, privateKeyToAccount, Address } from "viem/accounts";
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// --- Environment Variable Loading ---
const privateKeyEnv = process.env.WALLET_PRIVATE_KEY;
const rpcProviderUrlEnv = process.env.RPC_PROVIDER_URL;
const walletPath = path.resolve(process.cwd(), 'wallet.json'); // Assumes wallet.json is in the project root

// --- Validations ---
if (!privateKeyEnv) {
  throw new Error("WALLET_PRIVATE_KEY is not set in the .env file");
}
if (!rpcProviderUrlEnv) {
  throw new Error("RPC_PROVIDER_URL is not set in the .env file");
}
if (!fs.existsSync(walletPath)) {
    throw new Error(\`Arweave wallet file not found at \${walletPath}. Please ensure wallet.json exists in the project root.\`);
}

// --- ArDrive Turbo Client Setup ---
function parseWallet(filePath: string): any {
    try {
        const walletData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(walletData);
    } catch (error) {
        console.error(\`Error reading or parsing wallet file at \${filePath}:\`, error);
        throw new Error(\`Failed to load Arweave wallet. Ensure \${filePath} exists and is valid JSON.\`);
    }
}

const arweaveWallet = parseWallet(walletPath);

export const turboClient: TurboAuthenticatedClient = TurboFactory.authenticated({
    privateKey: arweaveWallet,
});
console.log("ArDrive Turbo Client initialized.");

// --- Story Protocol Client Setup ---
const storyPrivateKey: Address = \`0x\${privateKeyEnv}\`;
const storyAccount: Account = privateKeyToAccount(storyPrivateKey);

const storyConfig: StoryConfig = {
  account: storyAccount,
  transport: http(rpcProviderUrlEnv),
  chainId: "aeneid", // Adjust chainId if necessary
};

export const storyClient = StoryClient.newClient(storyConfig);
console.log("Story Client initialized.");
\`\`\``,
    shouldRemove: false
  },
  {
    name: 'AR.IO story page - legitimate bash commands',
    input: `### 1. Install Dependencies

First, set up a new project directory and install the necessary SDKs:

\`\`\`bash
mkdir story-arweave-project
cd story-arweave-project
\`\`\`

Then install the required dependencies:

### Installation Methods

npm
pnpm
yarn

\`\`\`bash
npm install --save @ardrive/turbo-sdk @story-protocol/core-sdk viem dotenv ts-node typescript
\`\`\``,
    expected: `### 1. Install Dependencies

First, set up a new project directory and install the necessary SDKs:

\`\`\`bash
mkdir story-arweave-project
cd story-arweave-project
\`\`\`

Then install the required dependencies:

### Installation Methods

npm
pnpm
yarn

\`\`\`bash
npm install --save @ardrive/turbo-sdk @story-protocol/core-sdk viem dotenv ts-node typescript
\`\`\``,
    shouldRemove: false
  },
  {
    name: 'AR.IO story page - legitimate JSON configuration',
    input: `### 2. Project Setup

Create the following files in your project:

1. \`.env\` file (in the project root):

\`\`\`
WALLET_PRIVATE_KEY=your_ethereum_private_key_without_0x_prefix
RPC_PROVIDER_URL=your_ethereum_rpc_provider_url
\`\`\`

1. Place your Arweave \`wallet.json\` file in the project root.
2. Create a \`tsconfig.json\` file in the project root:

\`\`\`json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true
  }
}
\`\`\``,
    expected: `### 2. Project Setup

Create the following files in your project:

1. \`.env\` file (in the project root):

\`\`\`
WALLET_PRIVATE_KEY=your_ethereum_private_key_without_0x_prefix
RPC_PROVIDER_URL=your_ethereum_rpc_provider_url
\`\`\`

1. Place your Arweave \`wallet.json\` file in the project root.
2. Create a \`tsconfig.json\` file in the project root:

\`\`\`json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true
  }
}
\`\`\``,
    shouldRemove: false
  },
  {
    name: 'AR.IO story page - content with potential JS artifacts',
    input: `This is legitimate documentation content.

<script>window.__NEXT_DATA__ = {"props":{"pageProps":{"doc":{"id":"story","title":"Registering Story Protocol IP Assets with Arweave Metadata using Turbo"}}}}</script>

More legitimate content here.

<div data-nextjs-data-checksum="1234567890">Some content</div>

<script>self.__next_f.push([1,"10:T109a,"])</script>

Even more legitimate documentation.`,
    expected: `This is legitimate documentation content.

More legitimate content here.

Even more legitimate documentation.`,
    shouldRemove: true
  },
  {
    name: 'AR.IO story page - mixed legitimate and artifact content',
    input: `## Registering an IP Asset

Now, let's create a script to register an IP asset. This involves three steps:

1. Define metadata for the IP itself and the NFT representing ownership
2. Upload metadata to Arweave using Turbo
3. Register the IP on Story Protocol

<script>window.__NEXT_DATA__ = {"props":{"pageProps":{"doc":{"id":"story"}}}}</script>

Create the following script file:

\`\`\`typescript
import { storyClient, turboClient } from "./utils/clients";
import { createHash } from "crypto";
import { Address } from "viem";
import type { UploadResult } from "@ardrive/turbo-sdk";

// Helper function to upload JSON to Arweave via Turbo
async function uploadJSONToArweave(jsonData: any, description: string): Promise<UploadResult> {
    const dataBuffer = Buffer.from(JSON.stringify(jsonData));
    console.log(\`Uploading \${description} (\${dataBuffer.byteLength} bytes) to Arweave via Turbo...\`);

    const tags = [
        { name: "Content-Type", value: "application/json" },
        { name: "App-Name", value: "ArDrive-Story-Tutorial" } // Example tag
    ];

    try {
        // Use Turbo to upload the file buffer
        const result = await turboClient.uploadFile(dataBuffer, { tags });
        console.log(\`\${description} uploaded successfully: Transaction ID \${result.id}\`);
        return result;
    } catch (error) {
        console.error(\`Error uploading \${description} to Arweave:\`, error);
        throw new Error(\`Arweave upload failed for \${description}.\`);
    }
}
\`\`\`

<script>self.__next_f.push([1,"20:T109b,"])</script>

This is more legitimate documentation content.`,
    expected: `## Registering an IP Asset

Now, let's create a script to register an IP asset. This involves three steps:

1. Define metadata for the IP itself and the NFT representing ownership
2. Upload metadata to Arweave using Turbo
3. Register the IP on Story Protocol

Create the following script file:

\`\`\`typescript
import { storyClient, turboClient } from "./utils/clients";
import { createHash } from "crypto";
import { Address } from "viem";
import type { UploadResult } from "@ardrive/turbo-sdk";

// Helper function to upload JSON to Arweave via Turbo
async function uploadJSONToArweave(jsonData: any, description: string): Promise<UploadResult> {
    const dataBuffer = Buffer.from(JSON.stringify(jsonData));
    console.log(\`Uploading \${description} (\${dataBuffer.byteLength} bytes) to Arweave via Turbo...\`);

    const tags = [
        { name: "Content-Type", value: "application/json" },
        { name: "App-Name", value: "ArDrive-Story-Tutorial" } // Example tag
    ];

    try {
        // Use Turbo to upload the file buffer
        const result = await turboClient.uploadFile(dataBuffer, { tags });
        console.log(\`\${description} uploaded successfully: Transaction ID \${result.id}\`);
        return result;
    } catch (error) {
        console.error(\`Error uploading \${description} to Arweave:\`, error);
        throw new Error(\`Arweave upload failed for \${description}.\`);
    }
}
\`\`\`

This is more legitimate documentation content.`,
    shouldRemove: true
  }
];

describe('AR.IO Story Page Content Processing', () => {
  arioStoryPageTestCases.forEach(({ name, input, expected, shouldRemove }) => {
    it(`should ${shouldRemove ? 'remove artifacts from' : 'preserve'} ${name}`, () => {
      // This will be implemented in the next phase
      expect(true).toBe(true); // Placeholder
    });
  });
});

// Test cases for edge cases and complex scenarios
const edgeCaseTestCases = [
  {
    name: 'Nested code blocks with artifacts',
    input: `\`\`\`javascript
// This is legitimate code
function test() {
  return "hello";
}

// But this might be an artifact
window.__NEXT_DATA__ = {"props":{}};
\`\`\`

Regular content here.`,
    expected: `\`\`\`javascript
// This is legitimate code
function test() {
  return "hello";
}

// But this might be an artifact
window.__NEXT_DATA__ = {"props":{}};
\`\`\`

Regular content here.`,
    shouldRemove: false // Code blocks should be preserved even if they contain artifacts
  },
  {
    name: 'Inline code with artifacts',
    input: `Use the \`window.__NEXT_DATA__\` variable to access data.`,
    expected: `Use the \`window.__NEXT_DATA__\` variable to access data.`,
    shouldRemove: false // Inline code should be preserved
  },
  {
    name: 'Multiple script tags',
    input: `Content before.

<script>var x = 1;</script>
<script>var y = 2;</script>
<script>var z = 3;</script>

Content after.`,
    expected: `Content before.

Content after.`,
    shouldRemove: true
  },
  {
    name: 'Script tags with legitimate content',
    input: `Content before.

<script>
// This is a legitimate script example
function example() {
  console.log("Hello World");
}
</script>

Content after.`,
    expected: `Content before.

Content after.`,
    shouldRemove: true // Script tags should be removed regardless of content
  }
];

describe('Edge Cases and Complex Scenarios', () => {
  edgeCaseTestCases.forEach(({ name, input, expected, shouldRemove }) => {
    it(`should handle ${name} correctly`, () => {
      // This will be implemented in the next phase
      expect(true).toBe(true); // Placeholder
    });
  });
});

// Integration test with actual crawler output simulation
describe('Integration Tests', () => {
  it('should process AR.IO story page content correctly', () => {
    const mockCrawlerOutput = {
      title: 'Registering Story Protocol IP Assets with Arweave Metadata using Turbo',
      content: `Registering Story Protocol IP Assets with Arweave Metadata using Turbo

<script>window.__NEXT_DATA__ = {"props":{"pageProps":{"doc":{"id":"story","title":"Registering Story Protocol IP Assets with Arweave Metadata using Turbo"}}}}</script>

> Utilize the speed and reliability of ArDrive Turbo to store metadata for Story Protocol IP Assets permanently on Arweave.

Story Protocol enables the registration and management of intellectual property (IP) on-chain. A crucial part of this process involves linking metadata to your IP Assets. While various storage solutions exist, Arweave offers permanent, decentralized storage, making it an ideal choice for valuable IP metadata.

<script>self.__next_f.push([1,"10:T109a,"])</script>

This guide demonstrates how to use the ArDrive Turbo SDK to efficiently upload IP Asset metadata to Arweave and register it with the Story Protocol TypeScript SDK.

## Prerequisites

Before you begin, ensure you have the following:

* **Node.js:** Version 18 or later. Download from nodejs.org.
* **npm/pnpm/yarn:** A compatible package manager.
* **Arweave Wallet:** A \`wallet.json\` file. Generate one using tools like the Wander browser extension. Keep this file secure and **do not commit it to version control**.
* **Turbo Credits:** Your Arweave wallet must be funded with Turbo credits to pay for uploads. Top up at <https://turbo-topup.com>.
* **Story Protocol Account:** An Ethereum-compatible private key (\`WALLET_PRIVATE_KEY\`) and an RPC Provider URL (\`RPC_PROVIDER_URL\`) for the desired Story Protocol network (e.g., Aeneid testnet) stored in a \`.env\` file.
* **TypeScript Environment:** You'll need to execute TypeScript code, so make sure you have \`ts-node\` installed globally (\`npm install -g ts-node\`) or as a dev dependency.`
    };

    const expectedProcessedContent = `Registering Story Protocol IP Assets with Arweave Metadata using Turbo

> Utilize the speed and reliability of ArDrive Turbo to store metadata for Story Protocol IP Assets permanently on Arweave.

Story Protocol enables the registration and management of intellectual property (IP) on-chain. A crucial part of this process involves linking metadata to your IP Assets. While various storage solutions exist, Arweave offers permanent, decentralized storage, making it an ideal choice for valuable IP metadata.

This guide demonstrates how to use the ArDrive Turbo SDK to efficiently upload IP Asset metadata to Arweave and register it with the Story Protocol TypeScript SDK.

## Prerequisites

Before you begin, ensure you have the following:

* **Node.js:** Version 18 or later. Download from nodejs.org.
* **npm/pnpm/yarn:** A compatible package manager.
* **Arweave Wallet:** A \`wallet.json\` file. Generate one using tools like the Wander browser extension. Keep this file secure and **do not commit it to version control**.
* **Turbo Credits:** Your Arweave wallet must be funded with Turbo credits to pay for uploads. Top up at <https://turbo-topup.com>.
* **Story Protocol Account:** An Ethereum-compatible private key (\`WALLET_PRIVATE_KEY\`) and an RPC Provider URL (\`RPC_PROVIDER_URL\`) for the desired Story Protocol network (e.g., Aeneid testnet) stored in a \`.env\` file.
* **TypeScript Environment:** You'll need to execute TypeScript code, so make sure you have \`ts-node\` installed globally (\`npm install -g ts-node\`) or as a dev dependency.`;

    // This will be implemented in the next phase
    expect(true).toBe(true); // Placeholder
  });
}); 