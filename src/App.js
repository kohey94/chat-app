import React, { useState, useEffect, useRef } from "react";
import { collection, addDoc, query, onSnapshot, orderBy } from "firebase/firestore";
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

  // ボイチャ開始
  const startVoiceChat = async () => {
    try {
      // オーディオローカルストリーム取得
      const localStream = 
        await navigator.mediaDevices.getUserMedia({ audio: true });
      localAudioRef.current.srcObject = localStream;
      localStreamRef.current = localStream;

      // WebRTCピアコネクションの作成
      const peerConnection = new RTCPeerConnection();
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

      peerConnection.current.srcObject = (event) => {
        // リモートオーディオを受信
        remoteAudioRef.current.srcObject = event.streams[0];
      }
      peerConnectionRef.current = peerConnection;
      setIsVoiceChatOn(true);

    } catch (error) {
      console.error("Error starting voice chat: ", error);
    }
  };

  // ボイチャ終了
  const stopVoiceChat = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.stop();
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
        {isVoiceChatOn ? (
          <div>
            <audio ref={localAudioRef} autoPlay muted />
            <audio ref={remoteAudioRef} autoPlay />
            <button onClick={stopVoiceChat}>Stop VC</button>
          </div>
        ) : (
          <button onClick={startVoiceChat}>Start VC</button>
        )}
      </div>
    </div>

  );
}

export default App;
