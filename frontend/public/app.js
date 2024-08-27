// public/app.js
document.addEventListener('DOMContentLoaded', function () {
    const sockets = io();
    const npcContainers = document.querySelectorAll('.npc-container');


    npcContainers.forEach(container => {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        container.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            // Get the mouse cursor position at startup:
            pos3 = e.clientX;
            pos4 = e.clientY;
            console.log('pos3X', pos3);
            console.log('pos4Y', pos4);
            document.onmouseup = closeDragElement;
            // Call a function whenever the cursor moves:
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            // Calculate the new cursor position:
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // Set the element's new position:
            container.style.top = (container.offsetTop - pos2) + "px";
            container.style.left = (container.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            // Stop moving when mouse button is released:
            document.onmouseup = null;
            document.onmousemove = null;
        }
    });

    const input = document.getElementById('message');

    input.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {  // Check if the key pressed is the Enter key
            event.preventDefault();  // Prevent the default action to stop it from submitting a form if any
            sendMessage();  // Call the sendMessage function that sends the message
        }
    });
});

const socket = io();

function showDialog(npcId) {
    var npcName = npcId.replace('-', ' ').toUpperCase();
    document.getElementById('npc-name').textContent = npcName;
    document.getElementById('dialog-box').classList.remove('hidden');
    document.getElementById('message').focus();
}

function sendMessage() {
    var npcId = document.getElementById('npc-name').textContent.toLowerCase().replace(' ', '-');
    var message = document.getElementById('message').value;
    console.log('send-message', { who: npcId, msg: message });
    socket.emit('send-message', { who: npcId, msg: message });

    document.getElementById('message').value = '';
    document.getElementById('dialog-box').classList.add('hidden');
}

function typeWriter(text, elementId) {
    let container = document.getElementById(elementId);
    let i = 0;
    let blinkTimeout, hideTimeout;
    function type() {
        if (i < text.length) {
            container.textContent += text.charAt(i);
            container.scrollTop = container.scrollHeight; // Scroll to bottom
            i++;
            setTimeout(type, 100); // Typing speed
        } else {
            // Start blinking 15 seconds after typing completes
            blinkTimeout = setTimeout(() => {
                container.classList.add('blinking'); // Start blinking effect

                // Hide the response box 5 seconds after blinking starts
                hideTimeout = setTimeout(() => {
                    container.classList.add('hidden'); // Hide the response box
                    container.classList.remove('blinking'); // Stop blinking
                }, 5000); // Hide the response after 5 seconds
            }, 5000); // display the response for 5 seconds before blinking
        }
    }

    // Clear any existing timeouts to avoid overlaps
    clearTimeout(blinkTimeout);
    clearTimeout(hideTimeout);
    container.classList.remove('hidden', 'blinking'); // Ensure the container is visible and not blinking when starting
    container.textContent = ''; // Clear any previous text
    type();
}

socket.on('receive-message', function(data) {
    var responseBoxId = `${data.who}-response`; // Assumes data.who is like 'npc1'
    var responseBox = document.getElementById(responseBoxId);
    responseBox.textContent = ''; // Clear previous content
    responseBox.classList.remove('hidden', 'blinking'); // Ensure it's visible and not blinking initially
    responseBox.classList.add('typing');

    typeWriter(data.msg, responseBoxId);
});


socket.on('bonus-message', function(data) {
    console.log('bonus-message', data.bonus);
    const dataContainer = document.getElementById('data-container');
    
        
    dataContainer.textContent = data.bonus;
    dataContainer.style.display = 'block';
   
        setTimeout(() => {
            dataContainer.style.display = 'none';
        }, 5000);
    
        
        dataContainer.classList.add('blinking');
        setTimeout(() => {
            dataContainer.classList.remove('blinking');
        }, 3000);
    
    
});
