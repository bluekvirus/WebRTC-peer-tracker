/**
 * Very simple screen sharing app using WebRTC.
 * 
 * Room == Session
 * Floor == RTCMultiConn's Room/Channel concept (not data channel)
 *
 * @author Tim Lauv 02.09.2015
 */
(function(){

	window.app = window.app || {};

	$(function domReady(){

		/* Setup signaling channel */
		var primus = Primus.connect('/primus');
		var $tag = $('#my-status');

		primus.on('open', function onOpen(){
			console.log('online!');
			$tag.html('online');
			$tag.addClass('label-green').removeClass('label-red');
		});
		primus.on('end', function onClose(){
			console.log('offline.');
			$tag.html('offline');
			$tag.removeClass('label-green').addClass('label-red');
		});
		primus.on('reconnect', function onRetry(){
			console.log('retrying...');
			$tag.html('reconnecting...');
			$tag.removeClass('label-green label-red');
		});

		/* Create RTC conn (pick a appname/floor) & signaling channel adapter*/
		var onMessageCallbacks = {};
		var rtc = new RTCMultiConnection('ShareScreen.io');
		$('#peerid').html(['peer:', rtc.userid].join(' '));
		rtc.skipLogs();
		
		primus.on('data', function onMessage(data){
		    if (data.sender == rtc.userid) return;

		    //console.log('[signal received]', data);
		    if (onMessageCallbacks[data.channel]) {
		        onMessageCallbacks[data.channel](data.message);
		    }
		});

		rtc.openSignalingChannel = function (config) {
		    var channel = config.channel || this.channel;
		    onMessageCallbacks[channel] = config.onmessage;

		    if (config.onopen) setTimeout(config.onopen, 1000);
		    return {
		        send: function (message) {
		            primus.write({
		                sender: rtc.userid,
		                channel: channel,
		                message: message
		            });
		        },
		        channel: channel
		    };
		};

		// Upon getting local OR remote media stream
		rtc.onstream = function(e) {

			if(e.type == 'local'){
				console.log('[local stream ready]');
			}
			else {
				console.log('[remote stream added]', e.type, e);
			}
			//delete e.mediaElement;
			$('#screen').attr('src', URL.createObjectURL(e.stream));
		
		};

		/* TBI: list available rooms */
		var rooms = {};
		rtc.onNewSession = function(s) {
			console.log('[room info]', s); //upon receiving room info (up, left...)
			if(rooms[s.sessionid]) return;
			rooms[s.sessionid] = s.userid;
		};

		rtc.connect();

		/* Hook up UI controls */
		$roomId = $('#roomId');
		function showStatus(roomId){
			$('#controlbar-start').hide();
			$('#status').html(roomId);
			$('#controlbar-end').show();

		}
		function hideStatus(){
			$('#controlbar-start').show();
			$('#controlbar-end').hide();
			$('#screen').stop();
		}
		hideStatus();
		$('#host').click(function hostScreenShare(){
			var perspectiveRoom = $roomId.val() || 'default-room';
			if(rooms[perspectiveRoom]){
				return alert('Room [' + perspectiveRoom + '] exists, please use other names...');
			}

			// Customize what to share:
			rtc.session = {
				//video:true,
				//audio:true,
			    screen: true,
			    oneway: true
			};
			//rtc.transmitRoomOnce = true; --> need to send sd & roomid to server! 
			//									since previousely onlined peers won't get the sd from roomid  
			var sd = rtc.open(perspectiveRoom);
			showStatus('Hosting: ' + perspectiveRoom);
			//now when the host starts [> the stream, the broadcasting begins.
			//we use the default room-id broadcasting mech here, ignoring returned sd.
		});
		$('#join').click(function joinScreenShare(){
			var targetRoom = $roomId.val() || 'default-room';
			if(!rooms[targetRoom]){
				return alert('Room [' + targetRoom + '] not available...');
			}

			rtc.join(targetRoom);
			showStatus('Watching: ' + targetRoom);
		});

		$('#stop').click(function onStop(){
			//rtc.leave();
			location.reload(false);
		});


	});

})();