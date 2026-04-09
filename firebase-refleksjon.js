console.log("🔥 firebase-refleksjon.js LASTET");

// firebase-refleksjon.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAKZMu2HZPmmoZ1fFT7DNA9Q6ystbKEPgE",
  authDomain: "samnanger-g14-f10a1.firebaseapp.com",
  projectId: "samnanger-g14-f10a1",
  storageBucket: "samnanger-g14-f10a1.firebasestorage.app",
  messagingSenderId: "926427862844",
  appId: "1:926427862844:web:5e6d11bb689c802d01b039",
  measurementId: "G-EJL3YYC63R"
};

// 🔑 ÉN felles app for refleksjon
export const app = initializeApp(firebaseConfig);

// 🔑 DELTE instanser (kritisk)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");

