// Firebase/Firestore access only — no React here. Everything the app does
// against the backend (auth, reading/writing a week's tasks, the cross-week
// carry-over transaction) is exposed through the WeeklyPlannerAPI object.
var WeeklyPlannerAPI = (function () {
  var firebaseConfig = {
    apiKey: "AIzaSyCjfiJ54a7BGn4FiEzt-0x_qbNWNWOa7Zs",
    authDomain: "weekly-planner-5f03b.firebaseapp.com",
    projectId: "weekly-planner-5f03b",
    storageBucket: "weekly-planner-5f03b.firebasestorage.app",
    messagingSenderId: "264769508670",
    appId: "1:264769508670:web:3ea3e0c1bf840b7513086f"
  };

  var firebaseReady = false;
  try {
    if (firebaseConfig.apiKey.indexOf("여기에") === -1) {
      firebase.initializeApp(firebaseConfig);
      firebaseReady = true;
    } else {
      showFallback(
        "Firebase 설정이 아직 입력되지 않았어요.\n" +
        "코드 상단의 firebaseConfig 값을 본인 프로젝트 값으로 채워주세요."
      );
    }
  } catch (e) {
    showFallback("Firebase 초기화 중 오류: " + e.message);
  }

  function weekDoc(weekKey) {
    return firebase.firestore().collection("weeklyPlanner").doc(weekKey);
  }

  // calls onSignedIn(uid) once signed in (anonymously, if needed); returns an unsubscribe fn
  function watchAuth(onSignedIn, onError) {
    if (!window.firebase || !firebaseReady) return function () {};
    var auth = firebase.auth();
    return auth.onAuthStateChanged(function (user) {
      if (user) {
        onSignedIn(user.uid);
      } else {
        auth.signInAnonymously().catch(onError);
      }
    });
  }

  // live-subscribes to a week's tasks array; returns an unsubscribe fn
  function watchWeek(weekKey, onTasks, onError) {
    return weekDoc(weekKey).onSnapshot(function (docSnap) {
      var data = docSnap.exists ? docSnap.data() : null;
      onTasks(data && Array.isArray(data.tasks) ? data.tasks : []);
    }, onError);
  }

  function writeWeek(weekKey, tasks) {
    return weekDoc(weekKey).set({ tasks: tasks, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  // reads this week's + last week's docs in one transaction and lets
  // computeUpdate(currentTasks, prevTasks) decide what to write to each side;
  // computeUpdate returns null to skip the write entirely, or
  // { nextCurrent, markedPrev } to commit both docs atomically
  function runCarryOverFromPrevWeek(currentKey, prevKey, computeUpdate) {
    var db = firebase.firestore();
    var currentRef = weekDoc(currentKey);
    var prevRef = weekDoc(prevKey);

    return db.runTransaction(async function (tx) {
      var snaps = await Promise.all([tx.get(currentRef), tx.get(prevRef)]);
      var currentSnap = snaps[0];
      var prevSnap = snaps[1];
      var currentTasks = currentSnap.exists && Array.isArray(currentSnap.data().tasks) ? currentSnap.data().tasks : [];
      var prevTasks = prevSnap.exists && Array.isArray(prevSnap.data().tasks) ? prevSnap.data().tasks : [];

      var update = computeUpdate(currentTasks, prevTasks);
      if (!update) return;

      tx.set(currentRef, { tasks: update.nextCurrent, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      tx.set(prevRef, { tasks: update.markedPrev, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
  }

  return {
    get firebaseReady() { return firebaseReady; },
    watchAuth: watchAuth,
    watchWeek: watchWeek,
    writeWeek: writeWeek,
    runCarryOverFromPrevWeek: runCarryOverFromPrevWeek
  };
})();
