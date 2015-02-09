/**
 * This is a simple WebRTC peer tracker (just relaying messages)
 */
var Primus = require('primus'),
path = require('path'),
colors = require('colors');

var primus = Primus.createServer(function onConnect(spark /*peer*/){

	//Protocol:: Just broadcast the messages out: (without peer records)
	spark.on('data', function onMessage(data){
		primus.write(data);
		console.log(['peer', spark.id.yellow, '(', data.sender, ') ==>'.grey, 'all @', new Date()].join(' '));
		//console.dir(data);
	});

}, {
	//Options::
	port: 5000,
	transformer: 'websockets'
});

//Client Lib:: Save the client api into a lib file.
primus.save(path.join(__dirname, '..', 'client', 'js', 'primus.js'));

//Logs:: simple client on/off logging.
primus.on('connection', function onPeerOnline(spark){
	console.log(['peer', spark.id.yellow, spark.address.ip, 'online'.green].join(' '));
	console.time(spark.id);
});
primus.on('disconnection', function onPeerOffline(spark){
	console.log(['peer', spark.id.yellow, 'offline'.red].join(' '));
	console.timeEnd(spark.id);
});