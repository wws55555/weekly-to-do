// Firebase/Firestore access only — no React here. Everything the app does
// against the backend (auth, reading/writing a week's tasks, the cross-week
// carry-over transaction) is exposed through the WeeklyPlannerAPI object.
//
// Each signed-in account owns its own private data at
// users/{uid}/weeklyPlanner/{weekKey} — nothing is shared between accounts.
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

  function weekDoc(uid, weekKey) {
    return firebase.firestore().collection("users").doc(uid).collection("weeklyPlanner").doc(weekKey);
  }

  // reports the current signed-in user (or null) and every change after;
  // does NOT sign anyone in automatically. Returns an unsubscribe fn.
  function watchAuthState(onChange) {
    if (!window.firebase || !firebaseReady) return function () {};
    return firebase.auth().onAuthStateChanged(onChange);
  }

  function signUp(email, password) {
    return firebase.auth().createUserWithEmailAndPassword(email, password);
  }

  function signIn(email, password) {
    return firebase.auth().signInWithEmailAndPassword(email, password);
  }

  // Firebase requires a recent sign-in before changing the password, so
  // re-authenticate with the current password first, then update it
  function changePassword(currentPassword, newPassword) {
    var user = firebase.auth().currentUser;
    if (!user) return Promise.reject(new Error("로그인이 필요해요."));
    var credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
    return user.reauthenticateWithCredential(credential).then(function () {
      return user.updatePassword(newPassword);
    });
  }

  function signOutUser() {
    return firebase.auth().signOut();
  }

  // live-subscribes to a week's tasks array; returns an unsubscribe fn
  function watchWeek(uid, weekKey, onTasks, onError) {
    return weekDoc(uid, weekKey).onSnapshot(function (docSnap) {
      var data = docSnap.exists ? docSnap.data() : null;
      onTasks(data && Array.isArray(data.tasks) ? data.tasks : []);
    }, onError);
  }

  // one-shot read of every week doc whose weekKey (a Monday, YYYY-MM-DD)
  // falls in [fromKey, toKey] — keys sort chronologically as strings, so a
  // document-id range query covers it. Resolves to { weekKey: tasks }; weeks
  // with no doc are simply absent. Used by the calendar picker's markers.
  function fetchWeeksInRange(uid, fromKey, toKey) {
    var idField = firebase.firestore.FieldPath.documentId();
    return firebase.firestore().collection("users").doc(uid).collection("weeklyPlanner")
      .where(idField, ">=", fromKey).where(idField, "<=", toKey)
      .get()
      .then(function (qs) {
        var out = {};
        qs.forEach(function (d) {
          var data = d.data();
          out[d.id] = Array.isArray(data.tasks) ? data.tasks : [];
        });
        return out;
      });
  }

  // read-modify-write of one week's tasks array inside a transaction:
  // mutate(currentServerTasks) returns the next array, or null to skip the
  // write. Since the whole array is rewritten, deriving it from the server's
  // latest copy (rather than whatever this client last saw) is what keeps a
  // write from wiping changes made meanwhile by another device or by the
  // concurrent carry-over transaction. mutate may run more than once if the
  // transaction retries, so it must be pure.
  function updateWeek(uid, weekKey, mutate) {
    var ref = weekDoc(uid, weekKey);
    return firebase.firestore().runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      var currentTasks = snap.exists && Array.isArray(snap.data().tasks) ? snap.data().tasks : [];
      var next = mutate(currentTasks);
      if (!next) return;
      tx.set(ref, { tasks: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
  }

  // reads this week's + last week's docs (both under the same uid) in one
  // transaction and lets computeUpdate(currentTasks, prevTasks) decide what
  // to write to each side; computeUpdate returns null to skip the write
  // entirely, or { nextCurrent, markedPrev } to commit both docs atomically
  function runCarryOverFromPrevWeek(uid, currentKey, prevKey, computeUpdate) {
    var db = firebase.firestore();
    var currentRef = weekDoc(uid, currentKey);
    var prevRef = weekDoc(uid, prevKey);

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

  // moves a task between two arbitrary week docs (both under the same uid) in
  // one transaction — used when editing a task's date lands it in a
  // different week than the one currently open. computeMove(sourceTasks,
  // targetTasks) decides what to write to each side; returns null to skip
  // the write entirely, or { nextSource, nextTarget } to commit both docs
  // atomically. Only call this when sourceKey !== targetKey — same-doc
  // moves should just go through updateWeek instead.
  function moveTaskAcrossWeeks(uid, sourceKey, targetKey, computeMove) {
    var db = firebase.firestore();
    var sourceRef = weekDoc(uid, sourceKey);
    var targetRef = weekDoc(uid, targetKey);

    return db.runTransaction(async function (tx) {
      var snaps = await Promise.all([tx.get(sourceRef), tx.get(targetRef)]);
      var sourceTasks = snaps[0].exists && Array.isArray(snaps[0].data().tasks) ? snaps[0].data().tasks : [];
      var targetTasks = snaps[1].exists && Array.isArray(snaps[1].data().tasks) ? snaps[1].data().tasks : [];

      var update = computeMove(sourceTasks, targetTasks);
      if (!update) return;

      tx.set(sourceRef, { tasks: update.nextSource, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      tx.set(targetRef, { tasks: update.nextTarget, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
  }

  return {
    get firebaseReady() { return firebaseReady; },
    watchAuthState: watchAuthState,
    signUp: signUp,
    signIn: signIn,
    signOutUser: signOutUser,
    changePassword: changePassword,
    watchWeek: watchWeek,
    updateWeek: updateWeek,
    fetchWeeksInRange: fetchWeeksInRange,
    runCarryOverFromPrevWeek: runCarryOverFromPrevWeek,
    moveTaskAcrossWeeks: moveTaskAcrossWeeks
  };
})();
