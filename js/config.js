// ---------------------------------------------------------------------------
// PICK UP N GO — configuration
//
// DEMO MODE (default): leave FIREBASE_CONFIG as null. All data (menu, orders,
// settings, accounts) is stored in this browser's LocalStorage and syncs live
// between tabs — perfect for trying the customer, staff and admin views.
//
// FIREBASE MODE: paste your Firebase web app config below. The app will then
// use Firebase Authentication, Cloud Firestore and Firebase Storage. Deploy
// firestore.rules and storage.rules from this repo. See README.md.
// ---------------------------------------------------------------------------

export const FIREBASE_CONFIG = null;
/* Example:
export const FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:xxxxxxxxxxxx',
};
*/

export const FIREBASE_SDK_VERSION = '10.12.2';

export const APP_VERSION = '1.0.0';
