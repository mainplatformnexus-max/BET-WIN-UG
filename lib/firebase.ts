import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyDWsRiXQ-0HL7TLCJvvsvTbBuHP_m0I26M",
  authDomain: "bet-win-ug.firebaseapp.com",
  databaseURL: "https://bet-win-ug-default-rtdb.firebaseio.com",
  projectId: "bet-win-ug",
  storageBucket: "bet-win-ug.firebasestorage.app",
  messagingSenderId: "465547150550",
  appId: "1:465547150550:web:8ee3ad535501cc2f4eb577",
  measurementId: "G-HMVPJ5YBP0",
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)
