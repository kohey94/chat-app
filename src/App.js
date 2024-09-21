import React, { useState, useEffect, useRef } from "react";
import { collection, addDoc, query, onSnapshot, orderBy, setDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";
import './App.css';

function App() {
  const messageEndRef = useRef(null);

  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isVoiceChatOn, setIsVoiceChatOn] = useState(false);
  const [callId, setCallId] = useState("");
  
  const servers = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302", // GoogleのSTUNサーバーを使用
      }
    ]
  }

  // チャットスクロール制御
  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // チャットデータ取得
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);
      scrollToBottom();
    });
    
    return () => unsubscribe();
  }, []);

  // メッセージ送信
  const sendMessage = async () => {
    if (message.trim()) {
      await addDoc(collection(db, "messages"), {
        text: message,
        timestamp: new Date(),
      });
      setMessage("");
    }
  };

  // ボイチャ開始（オファー側）
  const startVoiceChat = async () => {
    try {
      // Firestoreにドキュメント作成（シグナリング用）
      const callDoc = await addDoc(collection(db, "calls"), {});
      setCallId(callDoc.id); // callIdを保存
      const offerCandidates = collection(callDoc, "offerCandidates");
      const answerCandidates = collection(callDoc, "answerCandidates");

      // オーディオローカルストリーム取得
      const localStream = 
        await navigator.mediaDevices.getUserMedia({ audio: true });
      localAudioRef.current.srcObject = localStream;
      localStreamRef.current = localStream;

      // WebRTCピアコネクションの作成（STUNサーバー追加）
      const peerConnection = new RTCPeerConnection(servers);
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(offerCandidates, event.candidate.toJSON());
        }
      };

      peerConnection.ontrack = (event) => {
        // リモートオーディオを受信
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // オファーを作成してFirestoreに保存
      const offerDescription = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offerDescription);
      await setDoc(callDoc, { offer: offerDescription });

      // Firestoreからアンサーを監視
      onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (!peerConnection.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          peerConnection.setRemoteDescription(answerDescription);
        }
      });

      // ICE候補のリスナー
      onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            peerConnection.addIceCandidate(candidate);
          }
        });
      });

      peerConnectionRef.current = peerConnection;
      setIsVoiceChatOn(true);

    } catch (error) {
      console.error("Error starting voice chat: ", error);
    }
  };

  // ボイチャに参加（アンサー側）
  const joinVoiceChat = async (callId) => {
    try {
      const callDoc = doc(db, "calls", callId);
      const offerCandidates = collection(callDoc, "offerCandidates");
      const answerCandidates = collection(callDoc, "answerCandidates");

      // オーディオローカルストリーム取得
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localAudioRef.current.srcObject = localStream;
      localStreamRef.current = localStream;

      // WebRTCピアコネクションの作成
      const peerConnection = new RTCPeerConnection(servers);
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(answerCandidates, event.candidate.toJSON());
        }
      };

      peerConnection.ontrack = (event) => {
        remoteAudioRef.current.srcObject = event.streams[0];
      };

      // Firestore からオファーを取得
      const callData = (await getDoc(callDoc)).data();
      const offerDescription = callData.offer;
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

      // アンサーを作成して Firestore に保存
      const answerDescription = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answerDescription);
      await updateDoc(callDoc, { answer: answerDescription });

      // ICE候補のリスナー
      onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            peerConnection.addIceCandidate(candidate);
          }
        });
      });

      peerConnectionRef.current = peerConnection;
      setIsVoiceChatOn(true);


    } catch (error) {
      console.error("Error joining voice chat: ", error);
    }
  };

  // ボイチャ終了
  const stopVoiceChat = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    setIsVoiceChatOn(false);
  }

  return (
    <div className="chat-container">
      {/* テキストチャット部分 */}
      <div className="message-list">
        {messages.map((msg, index) => (
          <div key={index} className="message">
            <p className="message-text">{msg.text}</p>
            <span className="message-timestamp">
              {new Date(msg.timestamp.seconds * 1000).toLocaleString()}
            </span>
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>
      <div className="input-container">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>

      {/* ボイスチャット機能 */}
      <div className="voice-chat-container">
        <h2>ボイスチャット</h2>
        <audio ref={localAudioRef} autoPlay muted />
        <audio ref={remoteAudioRef} autoPlay />
        {isVoiceChatOn ? (
          <button onClick={stopVoiceChat}>Stop VC</button>
        ) : (
          <button onClick={startVoiceChat}>Start VC</button>
        )}
        {/* 参加用のUI */}
        <input
          type="text"
          value={callId}
          onChange={(e) => setCallId(e.target.value)}
          placeholder="Enter Call ID to Join"
        />
        <button onClick={() => joinVoiceChat(callId)}>Join VC</button>
      </div>
    </div>

  );
}

export default App;
