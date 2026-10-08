// ==========================================
// 1. HELPER FUNCTIONS & DOM UTILITIES
// ==========================================

// Helper function to select HTML elements by ID
const $ = function(id) {
  return document.getElementById(id);
};

// TextEncoder converts strings into Uint8Arrays (bytes)
// TextDecoder converts Uint8Arrays (bytes) back into readable strings
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Converts a byte array (Uint8Array) into a Base64 encoded string.
 * Processed in chunks to avoid stack overflow errors on large data.
 */
const bytesTo64 = function(byteArray) {
  let binaryString = "";
  const CHUNK_SIZE = 32768;

  for (let i = 0; i < byteArray.length; i += CHUNK_SIZE) {
    const chunk = byteArray.subarray(i, i + CHUNK_SIZE);
    binaryString += String.fromCharCode(...chunk);
  }

  return btoa(binaryString);
};

/**
 * Converts a Base64 encoded string back into a Uint8Array (byte array).
 */
const b64ToBytes = function(base64String) {
  const binaryString = atob(base64String);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
};


// ==========================================
// 2. HUFFMAN COMPRESSION ALGORITHM
// ==========================================

/**
 * Builds a Huffman Tree and generates binary variable-length codes
 * for each character based on frequency.
 */
function buildHuffman(text) {
  // Step 1: Count frequency of each character
  const frequencyMap = new Map();
  const characters = Array.from(text);

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const count = frequencyMap.get(char) || 0;
    frequencyMap.set(char, count + 1);
  }

  // Step 2: Convert frequency map to an array of node objects
  let nodes = [];
  frequencyMap.forEach(function(freq, char) {
    nodes.push({ char: char, freq: freq });
  });

  // Edge case: handle single character text input
  if (nodes.length === 1) {
    const singleChar = nodes[0].char;
    return {
      tree: nodes[0],
      codes: { [singleChar]: '0' }
    };
  }

  // Step 3: Repeatedly merge the two lowest-frequency nodes into a binary tree
  while (nodes.length > 1) {
    // Sort ascending by frequency
    nodes.sort(function(a, b) {
      return a.freq - b.freq;
    });

    const left = nodes.shift();  // Lowest frequency node
    const right = nodes.shift(); // Second lowest frequency node

    // Combine into a parent node
    const parentNode = {
      freq: left.freq + right.freq,
      left: left,
      right: right
    };

    nodes.push(parentNode);
  }

  const tree = nodes[0];
  const codes = {};

  // Step 4: Recursively walk tree to assign binary string codes ('0' = left, '1' = right)
  function walkTree(node, currentPath) {
    if (currentPath === undefined) {
      currentPath = '';
    }

    // Leaf node reached
    if (node.char !== undefined) {
      codes[node.char] = currentPath || '0';
      return;
    }

    walkTree(node.left, currentPath + '0');
    walkTree(node.right, currentPath + '1');
  }

  walkTree(tree, '');

  return {
    tree: tree,
    codes: codes
  };
}

/**
 * Packs a string of '0's and '1's into a dense Uint8Array byte buffer,
 * then converts it to Base64.
 */
function packBits(bits) {
  const totalBytes = Math.ceil(bits.length / 8);
  const outputBytes = new Uint8Array(totalBytes);

  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      const byteIndex = i >> 3;    // Same as Math.floor(i / 8)
      const bitPosition = 7 - (i & 7); // Bit position inside byte (7 down to 0)
      outputBytes[byteIndex] |= (1 << bitPosition);
    }
  }

  return bytesTo64(outputBytes);
}

/**
 * Unpacks a Base64 encoded bit sequence back into a string of '0' and '1' characters.
 */
function unpackBits(data, length) {
  const bytes = b64ToBytes(data);
  let bitString = '';

  for (let i = 0; i < length; i++) {
    const byteIndex = i >> 3;
    const bitPosition = 7 - (i & 7);
    const bitValue = (bytes[byteIndex] >> bitPosition) & 1;
    bitString += bitValue;
  }

  return bitString;
}

/**
 * Serializes Huffman Tree for storage (strips unused frequency properties).
 */
function serialise(node) {
  if (node.char !== undefined) {
    return { c: node.char };
  }
  return {
    l: serialise(node.left),
    r: serialise(node.right)
  };
}

/**
 * Restores serialized node structure back into standard node representation.
 */
function restore(node) {
  if (node.c !== undefined) {
    return { char: node.c };
  }
  return {
    left: restore(node.l),
    right: restore(node.r)
  };
}

/**
 * Traverses Huffman Tree with binary path strings to reconstruct original message.
 */
function decodeHuffman(tree, bits, totalCharacters) {
  // Edge case for repeated single character text
  if (tree.char !== undefined) {
    return tree.char.repeat(totalCharacters);
  }

  let decodedText = '';
  let currentNode = tree;

  for (let i = 0; i < bits.length; i++) {
    const bit = bits[i];

    if (bit === '0') {
      currentNode = currentNode.left;
    } else {
      currentNode = currentNode.right;
    }

    // Leaf node found
    if (currentNode.char !== undefined) {
      decodedText += currentNode.char;
      currentNode = tree; // Reset search pointer to root node
    }
  }

  return decodedText;
}


// ==========================================
// 3. CRYPTOGRAPHY FUNCTIONS (Web Crypto API)
// ==========================================

/**
 * Derives an AES-GCM encryption key using PBKDF2 key strengthening.
 */
async function makeKey(password, salt, usage) {
  const encodedPassword = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    encodedPassword,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 250000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );

  return derivedKey;
}

/**
 * Encrypts payload JSON string using AES-GCM algorithm.
 */
async function protect(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await makeKey(password, salt, 'encrypt');
  const payloadBytes = encoder.encode(JSON.stringify(payload));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    payloadBytes
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);

  // Return formatted header & Base64 elements: "SM1.salt.iv.encryptedData"
  return 'SM1.' + bytesTo64(salt) + '.' + bytesTo64(iv) + '.' + bytesTo64(encryptedBytes);
}

/**
 * Decrypts encrypted code payload using password.
 */
async function unprotect(code, password) {
  const parts = code.trim().split('.');

  if (parts.length !== 4 || parts[0] !== 'SM1') {
    throw new Error('Invalid Secure Message code.');
  }

  const salt = b64ToBytes(parts[1]);
  const iv = b64ToBytes(parts[2]);
  const data = b64ToBytes(parts[3]);

  const key = await makeKey(password, salt, 'decrypt');

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );

  const decodedString = decoder.decode(decryptedBuffer);
  return JSON.parse(decodedString);
}


// ==========================================
// 4. UI HANDLERS & EVENT LISTENERS
// ==========================================

function status(id, text, isError) {
  if (isError === undefined) {
    isError = false;
  }

  const element = $(id);
  if (!element) return;

  element.textContent = text;
  if (isError) {
    element.className = 'status error';
  } else {
    element.className = 'status';
  }
}

function setLoading(button, isLoading) {
  button.classList.toggle('loading', isLoading);
  button.disabled = isLoading;
}

async function copyField(id, button) {
  const field = $(id);
  if (!field || !field.value) return;

  await navigator.clipboard.writeText(field.value);

  const originalHTML = button.innerHTML;
  button.innerHTML = '✓ <span>Copied</span>';

  setTimeout(function() {
    button.innerHTML = originalHTML;
  }, 1300);
}

// Attach Copy listeners
const copyButtons = document.querySelectorAll('[data-copy]');
copyButtons.forEach(function(button) {
  button.addEventListener('click', function() {
    copyField(button.dataset.copy, button).catch(function() {});
  });
});

// Attach Password Reveal Toggle listeners
const revealButtons = document.querySelectorAll('[data-reveal]');
revealButtons.forEach(function(button) {
  button.addEventListener('click', function() {
    const inputElement = $(button.dataset.reveal);
    if (inputElement.type === 'password') {
      inputElement.type = 'text';
    } else {
      inputElement.type = 'password';
    }
  });
});

// Mobile Navigation Toggle
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (menuToggle) {
  menuToggle.addEventListener('click', function() {
    const isOpen = navLinks.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', isOpen);
  });
}

// Character Counter
const messageInput = $('message');
if (messageInput) {
  messageInput.addEventListener('input', function(event) {
    const length = Array.from(event.target.value).length;
    $('messageCount').textContent = length + ' characters';
  });
}

// Encode Button Listener
const encodeBtn = $('encodeButton');
if (encodeBtn) {
  encodeBtn.addEventListener('click', async function() {
    const message = $('message').value;
    const password = $('encodePassword').value;

    status('encodeStatus', '');

    if (!message.trim()) {
      return status('encodeStatus', 'Please enter a message.', true);
    }
    if (password.length < 8) {
      return status('encodeStatus', 'Password must contain at least 8 characters.', true);
    }

    setLoading(encodeBtn, true);

    try {
      const huffmanResult = buildHuffman(message);
      const tree = huffmanResult.tree;
      const codes = huffmanResult.codes;

      const bitsArray = Array.from(message, function(char) {
        return codes[char];
      });
      const bits = bitsArray.join('');

      const payload = {
        t: serialise(tree),
        d: packBits(bits),
        b: bits.length,
        n: Array.from(message).length
      };

      $('encodedOutput').value = await protect(payload, password);
      status('encodeStatus', 'Message encoded successfully. Copy the protected code below.');
      $('encodePassword').value = '';
    } catch (e) {
      status('encodeStatus', 'Encoding failed. Please try again.', true);
    } finally {
      setLoading(encodeBtn, false);
    }
  });
}

// Decode Button Listener
const decodeBtn = $('decodeButton');
if (decodeBtn) {
  decodeBtn.addEventListener('click', async function() {
    const code = $('encodedInput').value;
    const password = $('decodePassword').value;

    status('decodeStatus', '');

    if (!code.trim()) {
      return status('decodeStatus', 'Please paste a protected code.', true);
    }
    if (password.length < 8) {
      return status('decodeStatus', 'Enter the password of at least 8 characters.', true);
    }

    setLoading(decodeBtn, true);

    try {
      const payload = await unprotect(code, password);
      const restoredTree = restore(payload.t);
      const bits = unpackBits(payload.d, payload.b);

      $('decodedOutput').value = decodeHuffman(restoredTree, bits, payload.n);
      status('decodeStatus', 'Message decoded successfully.');
      $('decodePassword').value = '';
    } catch (e) {
      status('decodeStatus', 'Could not decode. Check the code and password.', true);
      $('decodePassword').value = '';
    } finally {
      setLoading(decodeBtn, false);
    }
  });
}
