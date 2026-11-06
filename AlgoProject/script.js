// Get the HTML elements we need
const messageInput = document.getElementById("message");
const compressButton = document.getElementById("compressButton");
const frequencyList = document.getElementById("frequencyList");
const treeContainer = document.getElementById("treeContainer");
const codeList = document.getElementById("codeList");
const compressedCode = document.getElementById("compressedCode");
const stats = document.getElementById("stats");


// Run Huffman compression when the button is clicked
compressButton.addEventListener("click", function () {
    const message = messageInput.value;

    if (message.length === 0) {
        alert("Please enter a message first.");
        return;
    }

    // Step 1: Count character frequency
    const frequencies = countFrequency(message);

    // Step 2: Create the Huffman tree
    const root = createHuffmanTree(frequencies);

    // Step 3: Create a code for every character
    const codes = {};
    makeCodes(root, "", codes);

    // Step 4: Create the compressed binary string
    let compressed = "";

    for (let i = 0; i < message.length; i++) {
        compressed += codes[message[i]];
    }

    // Show the results
    showFrequency(frequencies);
    showCodes(codes);
    showCompressedCode(compressed, message);
    drawTree(root);
});


// Count how many times each character appears
function countFrequency(message) {
    const frequencies = {};

    for (let i = 0; i < message.length; i++) {
        const character = message[i];

        if (frequencies[character] === undefined) {
            frequencies[character] = 1;
        } else {
            frequencies[character]++;
        }
    }

    return frequencies;
}


// Create the Huffman tree
function createHuffmanTree(frequencies) {
    let nodes = [];

    // Create one node for every unique character
    for (let character in frequencies) {
        nodes.push({
            character: character,
            frequency: frequencies[character],
            left: null,
            right: null
        });
    }

    // Keep combining the two smallest nodes
    while (nodes.length > 1) {
        nodes.sort(function (a, b) {
            return a.frequency - b.frequency;
        });

        const left = nodes.shift();
        const right = nodes.shift();

        const newNode = {
            character: null,
            frequency: left.frequency + right.frequency,
            left: left,
            right: right
        };

        nodes.push(newNode);
    }

    return nodes[0];
}


// Generate 0 and 1 codes by walking through the tree
function makeCodes(node, code, codes) {
    // If this is a leaf node, it contains a character
    if (node.left === null && node.right === null) {
        // For a message containing only one unique character
        if (code === "") {
            code = "0";
        }

        codes[node.character] = code;
        return;
    }

    // Going left means 0
    makeCodes(node.left, code + "0", codes);

    // Going right means 1
    makeCodes(node.right, code + "1", codes);
}


// Display character frequencies
function showFrequency(frequencies) {
    frequencyList.innerHTML = "";

    for (let character in frequencies) {
        const item = document.createElement("div");
        item.className = "frequency-item";

        const displayCharacter = getDisplayCharacter(character);

        item.innerHTML =
            '<span class="character">' + displayCharacter + '</span>' +
            '<span class="frequency">' + frequencies[character] + '</span>';

        frequencyList.appendChild(item);
    }
}


// Display Huffman codes
function showCodes(codes) {
    codeList.innerHTML = "";

    for (let character in codes) {
        const item = document.createElement("div");
        item.className = "code-item";

        const displayCharacter = getDisplayCharacter(character);

        item.innerHTML =
            '<span class="character">' + displayCharacter + '</span>' +
            '<span class="code">' + codes[character] + '</span>';

        codeList.appendChild(item);
    }
}


// Display the compressed binary code
function showCompressedCode(compressed, originalMessage) {
    compressedCode.innerHTML = compressed;

    // A simple comparison with 8 bits per character
    const originalBits = originalMessage.length * 8;
    const compressedBits = compressed.length;

    const savedBits = originalBits - compressedBits;

    if (savedBits >= 0) {
        stats.innerHTML =
            "Original size: " + originalBits + " bits | " +
            "Compressed size: " + compressedBits + " bits | " +
            "Saved: " + savedBits + " bits";
    } else {
        stats.innerHTML =
            "Original size: " + originalBits + " bits | " +
            "Compressed size: " + compressedBits + " bits";
    }
}


// Make special characters easier to understand
function getDisplayCharacter(character) {
    if (character === " ") {
        return "[space]";
    }

    if (character === "\n") {
        return "[newline]";
    }

    if (character === "\t") {
        return "[tab]";
    }

    return character;
}


// Draw the Huffman tree using SVG
function drawTree(root) {
    treeContainer.innerHTML = "";

    // Find the size needed for the tree
    const positions = [];
    let leafNumber = 0;

    function findPositions(node, depth) {
        if (node === null) {
            return;
        }

        if (node.left === null && node.right === null) {
            positions.push({
                node: node,
                x: leafNumber * 90 + 60,
                y: depth * 90 + 50
            });

            leafNumber++;
            return;
        }

        findPositions(node.left, depth + 1);
        findPositions(node.right, depth + 1);
    }

    findPositions(root, 0);

    // Put every node at the middle of its children
    function setInternalPositions(node, depth) {
        if (node === null) {
            return null;
        }

        if (node.left === null && node.right === null) {
            for (let i = 0; i < positions.length; i++) {
                if (positions[i].node === node) {
                    return positions[i].x;
                }
            }
        }

        const leftX = setInternalPositions(node.left, depth + 1);
        const rightX = setInternalPositions(node.right, depth + 1);

        const x = (leftX + rightX) / 2;

        positions.push({
            node: node,
            x: x,
            y: depth * 90 + 50
        });

        return x;
    }

    setInternalPositions(root, 0);

    let maxDepth = 0;

    for (let i = 0; i < positions.length; i++) {
        if (positions[i].y > maxDepth) {
            maxDepth = positions[i].y;
        }
    }

    const width = Math.max(600, leafNumber * 90 + 120);
    const height = maxDepth + 100;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("class", "tree-svg");

    // Get a node's position
    function getPosition(node) {
        for (let i = 0; i < positions.length; i++) {
            if (positions[i].node === node) {
                return positions[i];
            }
        }
    }

    // Draw lines and 0/1 labels
    function drawEdges(node) {
        if (node === null) {
            return;
        }

        const parent = getPosition(node);

        if (node.left !== null) {
            const child = getPosition(node.left);
            drawLine(parent, child, "0");
            drawEdges(node.left);
        }

        if (node.right !== null) {
            const child = getPosition(node.right);
            drawLine(parent, child, "1");
            drawEdges(node.right);
        }
    }

    function drawLine(parent, child, label) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", parent.x);
        line.setAttribute("y1", parent.y + 22);
        line.setAttribute("x2", child.x);
        line.setAttribute("y2", child.y - 22);
        line.setAttribute("class", "tree-line");
        svg.appendChild(line);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", (parent.x + child.x) / 2);
        text.setAttribute("y", (parent.y + child.y) / 2);
        text.setAttribute("class", "tree-edge-text");
        text.textContent = label;
        svg.appendChild(text);
    }

    // Draw all nodes
    function drawNodes(node) {
        if (node === null) {
            return;
        }

        const position = getPosition(node);

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", position.x);
        circle.setAttribute("cy", position.y);
        circle.setAttribute("r", 22);
        circle.setAttribute("class", "tree-node");
        svg.appendChild(circle);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", position.x);
        text.setAttribute("y", position.y);
        text.setAttribute("class", "tree-text");

        if (node.character === null) {
            text.textContent = node.frequency;
        } else {
            text.textContent = getDisplayCharacter(node.character) + ":" + node.frequency;
        }

        svg.appendChild(text);

        drawNodes(node.left);
        drawNodes(node.right);
    }

    drawEdges(root);
    drawNodes(root);

    treeContainer.appendChild(svg);
}
