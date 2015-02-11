/**
 * Very simple screen sharing app using WebRTC.
 * 
 * Room == Session
 * Floor == RTCMultiConn's Room/Channel concept (not data channel)
 *
 * FF (Hosting): 
 * 	media.getusermedia.screensharing.enabled = true
 * 	media.getusermedia.screensharing.allowed_domains + app domain or ip
 * Chrome (Hosting):
 * 	install plugin by clicking the prompted link.
 * 
 * @author Tim Lauv 02.09.2015
 */
(function(){

	window.app = window.app || {};

	$(function domReady(){
		$('#more-peers').click(function openMorePeers(){
			window.open(location.href);
		});

		/*==================== Setup signaling channel ====================*/
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

		/*=========== Create RTC conn (pick a appname/floor) & signaling channel adapter ===========*/
		var onMessageCallbacks = {};
		var rtc = new RTCMultiConnection('ShareScreen.io');
		rtc.skipLogs();
		rtc.media.min(1280,720);
		$('#peerid').html(['peer:', rtc.userid].join(' '));
		
		
		primus.on('data', function onMessage(data){
		    if (data.sender == rtc.userid) return;

		    //console.log('[signal received]', data);
		    if (onMessageCallbacks[data.channel]) {
		        onMessageCallbacks[data.channel](data.message);
		    }
		    //mark dropped peer
		    if(data.message.left){
		    	//console.log(data);
		    	rtc.remove(data.message.userid);
		    	//hack based on 4065 openSignalingChannel - onmessage (fixing the host left problem)
		    	delete rtc.sessionDescriptions[data.message.sessionid];
		    	rtc.numberOfSessions--;
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
				if (rtc.isInitiator) return;
				console.log('[remote stream added]', e.type, e);
			}
			//delete e.mediaElement;
			$('#screen').attr('src', URL.createObjectURL(e.stream));
		
		};

		/* TBI: list available rooms, BUG::onNewSession might not fire for previousely onlined client -- fixed*/
		var rooms = {};
		rtc.onNewSession = function(s) {
			console.log('[room info]', s); //upon receiving room info (up, left...)
			if(s.left){ 
				// if(!rooms[s.sessionid]){
				// 	rtc.refresh(); //reset the connection.
				// 	return;
				// }
				delete rooms[s.sessionid];
				return;
			}
			else rooms[s.sessionid] = s.userid;
		};

		rtc.connect();

		/*========================= Hook up UI controls =========================*/
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

		//A. Host
		$('#host').click(function hostScreenShare(){
			var perspectiveRoom = $roomId.val() || 'default-room';
			if(rooms[perspectiveRoom]){
				return alert('Room [' + perspectiveRoom + '] exists, please use other names...');
			}

			// List peer users for host
			// [hack 3355 updateSocket(), 3932 connection.remove() + onPeersChanged]
			var $peers = $('#peers');
			function renderPeers(){
				$peers.empty();
				var count = 0;
				for (var pid in rtc.peers) {
					if (pid == rtc.userid) continue;
					$peers.append('<li>' + '<i class="icon-' + rtc.peers[pid].userinfo.browser + '"></i> ' + pid + '</li>');
					count ++;
				}
				if(count){
					$('#screen').removeClass('unit-100').addClass('unit-70');
					$peers.prepend('<li style="list-style:none;">Participants <span class="badge badge-green right">'+ count +'</span></li>');
				}else
					$('#screen').removeClass('unit-70').addClass('unit-100');
			}
			rtc.onPeersChanged = function(){
				renderPeers();
			};

			// Customize what to share:
			rtc.session = {
				//video:true,
				//audio:true,
			    screen: true,
			    oneway: true
			};
			rtc.autoCloseEntireSession = true;
			rtc.interval = 5000;
			//rtc.transmitRoomOnce = true; --> need to send sd & roomid to server! 
			//									since previousely onlined peers won't get the sd from roomid  
			var sd = rtc.open(perspectiveRoom);

			//http://bit.ly/webrtc-screen-extension
			if(rtc.UA.isChrome)
				rtc.DetectRTC.screen.getChromeExtensionStatus(function(status){
					if (status == 'not-installed') 
						showStatus('Error: ' + 'you need to install <a target="_blank" href="http://bit.ly/webrtc-screen-extension">webrtc-screen-extension</a> or use Firefox');
					else 
						showStatus('Hosting: ' + perspectiveRoom);
				});
			else 			
				showStatus('<span class="label label-outline label-blue"><i class="fa fa-bullhorn"></i> Hosting</span> ' + perspectiveRoom);
			//now when the host starts [> the stream, the broadcasting begins.
			//we use the default room-id broadcasting mech here, ignoring returned sd.
			
			window.rtc = rtc;
		});

		//B. Join
		$('#join').click(function joinScreenShare(){
			var targetRoom = $roomId.val() || 'default-room';
			if(!rooms[targetRoom]){
				return alert('Room [' + targetRoom + '] not available...');
			}

			rtc.join(targetRoom);
			showStatus('<span class="label label-outline label-yellow"><i class="fa fa-slideshare"></i> Watching</span> ' + targetRoom);
		});

		//C. Drop
		$('#stop').click(function onStop(){
			rtc.leave();
			location.reload(false);
		});


	});

})();