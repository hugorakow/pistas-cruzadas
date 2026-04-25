import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey:            "AIzaSyA4OfoAKl-L--003GDsWKtu09H34H_dcn0",
  authDomain:        "pistas-cruzadas.firebaseapp.com",
  databaseURL:       "https://pistas-cruzadas-default-rtdb.firebaseio.com",
  projectId:         "pistas-cruzadas",
  storageBucket:     "pistas-cruzadas.firebasestorage.app",
  messagingSenderId: "462556842168",
  appId:             "1:462556842168:web:dea5582244496f1d2e0c4d",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
