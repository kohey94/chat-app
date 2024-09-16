import React, { useState, useEffect, useRef } from "react";
import { collection, addDoc, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "./firebaseConfig";
import './App.css';

function App() {
  const messageEndRef = useRef(null);

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

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

  const sendMessage = async () => {
    if (message.trim()) {
      await addDoc(collection(db, "messages"), {
        text: message,
        timestamp: new Date(),
      });
      setMessage("");
    }
  };

  return (
    <div className="chat-container">
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
    </div>

  );
}

export default App;
