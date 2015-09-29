var net = require('net');
var HOST = '127.0.0.1';
var PORT = 6969;

net.createServer(function(sock) {
    //uncomment for showing the connection opening   
    //console.log('CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);

    sock.on('data', function(data) {

	    //uncomment for showing the received DATA
	    //console.log('DATA ' + sock.remoteAddress + ': ' + data);

        sock.write(data);
    });
    sock.on('close', function(data) {
        //uncomment for showing the connection closing
	    //console.log('CLOSED: ' + sock.remoteAddress +' '+ sock.remotePort);
    });

}).listen(PORT, HOST);

console.log('Server listening on ' + HOST +':'+ PORT);
