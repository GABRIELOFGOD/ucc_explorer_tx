// const express = require("express");
// const cors = require("cors");
// const { ethers } = require("ethers");
// const { WebSocketServer } = require("ws");

// const app = express();
// app.use(cors());

// // Providers
// const provider = new ethers.JsonRpcProvider("http://168.231.122.245:8545"); // HTTP for history
// const wsProvider = new ethers.WebSocketProvider("ws://168.231.122.245:8546"); // WS for live updates

// // REST API (previous transactions)
// app.get("/transactions", async (req, res) => {
//   try {
//     const latestBlock = await provider.getBlockNumber();
//     let txs = [];

//     // Walk backwards up to 5 blocks
//     for (let i = 0; i < 100; i++) {
//       const blockNumber = latestBlock - i;
//       if (blockNumber < 0) break; // Prevent negative block numbers
//       try {
//         const block = await provider.getBlock(blockNumber, true); // Include txs
//         if (block && block.transactions) {
//           block.transactions.forEach((tx) => {
//             txs.push({
//               hash: tx.hash,
//               from: tx.from,
//               to: tx.to || null, // Handle contract creation
//               value: ethers.formatEther(tx.value),
//               blockNumber: tx.blockNumber,
//               timestamp: block.timestamp,
//             });
//           });
//         }
//       } catch (err) {
//         console.error(`Error fetching block ${blockNumber}:`, err);
//       }
//     }

//     res.json({ transactions: txs.slice(0, 50) }); // Cap at 50
//   } catch (err) {
//     console.error("Error in /transactions:", err);
//     res.status(500).json({ error: "Failed to fetch transactions" });
//   }
// });

// // Start REST API
// const REST_PORT = 3500;
// app.listen(REST_PORT, () => {
//   console.log(`✅ REST API running on http://localhost:${REST_PORT}`);
// });

// // WebSocket Relay (real-time updates)
// const WS_PORT = 4000;
// const wss = new WebSocketServer({ port: WS_PORT });

// function broadcast(data) {
//   wss.clients.forEach((client) => {
//     if (client.readyState === 1) {
//       try {
//         client.send(JSON.stringify(data));
//       } catch (err) {
//         console.error("Error broadcasting to client:", err);
//       }
//     }
//   });
// }

// wsProvider.on("block", async (blockNumber) => {
//   try {
//     const block = await wsProvider.getBlock(blockNumber, true);
//     if (block && block.transactions) {
//       block.transactions.forEach((tx) => {
//         broadcast({
//           hash: tx.hash,
//           from: tx.from,
//           to: tx.to || null, // Handle contract creation
//           value: ethers.formatEther(tx.value),
//           blockNumber: tx.blockNumber,
//           timestamp: block.timestamp,
//         });
//       });
//     }
//   } catch (err) {
//     console.error("Error processing block:", err);
//   }
// });

// // Handle WebSocket provider errors and reconnection
// wsProvider.on("error", (err) => {
//   console.error("WebSocket provider error:", err);
// });

// // Ensure WebSocket provider reconnects if disconnected
// wsProvider.websocket.on("close", () => {
//   console.log("WebSocket provider disconnected, attempting to reconnect...");
//   setTimeout(() => {
//     wsProvider.destroy();
//     const newWsProvider = new ethers.WebSocketProvider("ws://168.231.122.245:8546");
//     newWsProvider.on("block", async (blockNumber) => {
//       try {
//         const block = await newWsProvider.getBlock(blockNumber, true);
//         if (block && block.transactions) {
//           block.transactions.forEach((tx) => {
//             broadcast({
//               hash: tx.hash,
//               from: tx.from,
//               to: tx.to || null,
//               value: ethers.formatEther(tx.value),
//               blockNumber: tx.blockNumber,
//               timestamp: block.timestamp,
//             });
//           });
//         }
//       } catch (err) {
//         console.error("Error processing block:", err);
//       }
//     });
//   }, 5000);
// });

// console.log(`✅ WS Relay running on ws://localhost:${WS_PORT}`);

const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const { WebSocketServer } = require("ws");

const app = express();
app.use(cors({
  origin: ["http://localhost:3000", "https://ucscan.net"],
  methods: ["GET", "POST"],
}));

// Providers
const provider = new ethers.JsonRpcProvider("http://168.231.122.245:8545"); // HTTP for history
const wsProvider = new ethers.WebSocketProvider("ws://168.231.122.245:8546"); // WS for live updates

// REST API (previous transactions)
app.get("/transactions", async (req, res) => {
  try {
    const latestBlock = await provider.getBlockNumber();
    const blockLimit = 2000; // Max blocks to scan
    const pageSize = parseInt(req.query.pageSize) || 50; // Default to 50 transactions
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const startBlock = Math.max(latestBlock - blockLimit + 1, 0); // Earliest block
    let txs = [];
    let currentBlock = latestBlock - (page - 1) * 50; // Approximate blocks per page

    while (txs.length < pageSize && currentBlock >= startBlock) {
      try {
        const block = await provider.getBlock(currentBlock, false); // Fetch without full txs (hashes only)
        if (block && block.transactions.length > 0) {
          console.log(`Block ${currentBlock} has ${block.transactions.length} tx hashes`);
          const txPromises = block.transactions.map(async (hash) => {
            try {
              const tx = await provider.getTransaction(hash);
              if (!tx || tx.value == null) {
                console.warn(`Skipping invalid tx ${hash}`);
                return null;
              }
              return {
                hash: tx.hash,
                from: tx.from,
                to: tx.to || null,
                value: ethers.formatEther(tx.value),
                blockNumber: tx.blockNumber,
                timestamp: block.timestamp,
              };
            } catch (err) {
              console.error(`Error fetching tx ${hash}:`, err);
              return null;
            }
          });
          const txsInBlock = (await Promise.all(txPromises)).filter((tx) => tx !== null);
          txs.push(...txsInBlock);
        } else {
          console.log(`Block ${currentBlock} is empty or invalid`);
        }
      } catch (err) {
        console.error(`Error fetching block ${currentBlock}:`, err);
      }
      currentBlock--;
    }

    // Slice to exact pageSize if exceeded
    txs = txs.slice(0, pageSize);

    res.json({
      transactions: txs,
      total: txs.length,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("Error in /transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Start REST API
const REST_PORT = 3500;
app.listen(REST_PORT, () => {
  console.log(`✅ REST API running on http://localhost:${REST_PORT}`);
});

// WebSocket Relay (real-time updates)
const WS_PORT = 4000;
const wss = new WebSocketServer({ port: WS_PORT });

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(JSON.stringify(data));
      } catch (err) {
        console.error("Error broadcasting to client:", err);
      }
    }
  });
}

wsProvider.on("block", async (blockNumber) => {
  try {
    const block = await wsProvider.getBlock(blockNumber, false); // Fetch block with tx hashes
    if (block && block.transactions.length > 0) {
      console.log(`New block ${blockNumber} with ${block.transactions.length} tx hashes:`, block.transactions);
      const txPromises = block.transactions.map(async (hash) => {
        try {
          const tx = await wsProvider.getTransaction(hash);
          if (!tx || tx.value == null) {
            console.warn(`Skipping invalid tx ${hash}`);
            return null;
          }
          console.log(`Fetched tx ${hash}:`, {
            hash: tx.hash,
            from: tx.from,
            to: tx.to || null,
            value: ethers.formatEther(tx.value),
            blockNumber: tx.blockNumber,
            timestamp: block.timestamp,
          });
          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to || null,
            value: ethers.formatEther(tx.value),
            blockNumber: tx.blockNumber,
            timestamp: block.timestamp,
          };
        } catch (err) {
          console.error(`Error fetching tx ${hash}:`, err);
          return null;
        }
      });
      const txsInBlock = (await Promise.all(txPromises)).filter((tx) => tx !== null);
      txsInBlock.forEach((tx) => broadcast(tx));
    // } else {
    //   console.log(`Block ${blockNumber} is empty or invalid`);
    }
  } catch (err) {
    console.error(`Error processing block ${blockNumber}:`, err);
  }
});

// Handle WebSocket provider errors and reconnection
wsProvider.on("error", (err) => {
  console.error("WebSocket provider error:", err);
});

wsProvider.websocket.on("close", () => {
  console.log("WebSocket provider disconnected, attempting to reconnect...");
  setTimeout(() => {
    wsProvider.destroy();
    const newWsProvider = new ethers.WebSocketProvider("ws://168.231.122.245:8546");
    newWsProvider.on("block", async (blockNumber) => {
      try {
        const block = await newWsProvider.getBlock(blockNumber, false);
        if (block && block.transactions.length > 0) {
          console.log(`New block ${blockNumber} with ${block.transactions.length} tx hashes:`, block.transactions);
          const txPromises = block.transactions.map(async (hash) => {
            try {
              const tx = await newWsProvider.getTransaction(hash);
              if (!tx || tx.value == null) {
                console.warn(`Skipping invalid tx ${hash}`);
                return null;
              }
              console.log(`Fetched tx ${hash}:`, {
                hash: tx.hash,
                from: tx.from,
                to: tx.to || null,
                value: ethers.formatEther(tx.value),
                blockNumber: tx.blockNumber,
                timestamp: block.timestamp,
              });
              return {
                hash: tx.hash,
                from: tx.from,
                to: tx.to || null,
                value: ethers.formatEther(tx.value),
                blockNumber: tx.blockNumber,
                timestamp: block.timestamp,
              };
            } catch (err) {
              console.error(`Error fetching tx ${hash}:`, err);
              return null;
            }
          });
          const txsInBlock = (await Promise.all(txPromises)).filter((tx) => tx !== null);
          txsInBlock.forEach((tx) => broadcast(tx));
        } else {
          console.log(`Block ${blockNumber} is empty or invalid`);
        }
      } catch (err) {
        console.error(`Error processing block ${blockNumber}:`, err);
      }
    });
  }, 5000);
});

console.log(`✅ WS Relay running on ws://localhost:${WS_PORT}`);