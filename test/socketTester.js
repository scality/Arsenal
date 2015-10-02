import net from 'net';
const HOST = '127.0.0.1';
const PORT = 6969;

net.createServer(function handle(sock) {
    // uncomment for showing the connection opening
    // console.log('CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);

    sock.on('data', function receive(data) {
	    // uncomment for showing the received DATA
	    // console.log('DATA ' + sock.remoteAddress + ': ' + data);

        sock.write(data);
    });

    sock.on('close', function closing(data) {
        // uncomment for showing the connection closing
	    // console.log('CLOSED: ' + sock.remoteAddress +' '+ sock.remotePort);
        data;
    });
}).listen(PORT, HOST);

// console.log('Server listening on ' + HOST +':'+ PORT);
