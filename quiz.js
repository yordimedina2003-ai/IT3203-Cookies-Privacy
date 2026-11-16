/*
 * quiz.js - Self-assessment quiz for the "Cookies and Privacy" website
 *
 * What this script does:
 *  1. Starts a 10-minute timer when the user clicks "Start Quiz".
 *  2. Shows how many questions have been answered.
 *  3. On submit (or when time runs out) it grades every question,
 *     colors each question green/red, and shows a results panel with
 *     pass/fail, total score, each question's result and answer, and time spent.
 *  4. "Retake" / "Reset" clears all inputs and results and starts over.
 */

// ---------- Settings ----------
const TIME_LIMIT_SECONDS = 10 * 60; // 10 minutes
const PASS_PERCENT = 70;            // 7 of 10 to pass

// ---------- Answer key ----------
// type "text"     -> fill in the blank (accept = list of accepted answers after cleanup)
// type "radio"    -> multiple choice, one answer
// type "select"   -> multiple choice using a dropdown
// type "checkbox" -> multiple selection, all correct boxes (and no wrong ones) must be checked
const ANSWER_KEY = {
    q1:  { type: "text", accept: ["session"], display: "session" },
    q2:  { type: "text", accept: ["set-cookie", "setcookie", "set cookie"], display: "Set-Cookie" },
    q3:  { type: "text", accept: ["first", "1st"], display: "first (first-party)" },
    q4:  { type: "radio", correct: "c" },
    q5:  { type: "radio", correct: "b" },
    q6:  { type: "select", correct: "b" },
    q7:  { type: "radio", correct: "a" },
    q8:  { type: "radio", correct: "d" },
    q9:  { type: "checkbox", correct: ["a", "c", "e"] },
    q10: { type: "checkbox", correct: ["a", "b", "d"] }
};

const TOTAL_QUESTIONS = Object.keys(ANSWER_KEY).length;

// ---------- Page elements ----------
const form = document.getElementById("quiz-form");
const intro = document.getElementById("quiz-intro");
const startBtn = document.getElementById("start-btn");
const submitBtn = document.getElementById("submit-btn");
const resultsBox = document.getElementById("results");
const timerBar = document.getElementById("timer-bar");
const timeLeftEl = document.getElementById("time-left");
const progressEl = document.getElementById("progress-text");

// ---------- Quiz state ----------
let timerId = null;   // id from setInterval
let startTime = 0;    // when the quiz started (milliseconds)
let finished = false; // true after the quiz is submitted

// ---------- Helper functions ----------

// Turn seconds into "m:ss" (example: 125 -> "2:05")
function formatClock(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ":" + String(seconds).padStart(2, "0");
}

// Turn seconds into a friendly text (example: 125 -> "2 min 5 sec")
function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? minutes + " min " + seconds + " sec" : seconds + " sec";
}

// Clean up a typed answer so small differences do not count as wrong.
// Returns two versions: the basic one ("set-cookie") and a short one without
// a trailing "cookie(s)" or "-party" ("Session Cookies" -> "session", "First-Party" -> "first")
function cleanText(text) {
    const basic = text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[.:]$/, "");           // remove a trailing period or colon
    const short = basic
        .replace(/\s+cookies?$/, "")     // remove a trailing " cookie(s)"
        .replace(/[\s-]*party$/, "");    // remove a trailing "-party"
    return [basic, short];
}

// Escape text before putting it into HTML (protects against typed HTML)
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Get the visible label text of a radio/checkbox option
function optionText(name, value) {
    const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
    return input ? input.parentElement.textContent.trim() : value;
}

// Get the visible text of a dropdown option
function selectText(name, value) {
    const option = form.querySelector(`select[name="${name}"] option[value="${value}"]`);
    return option ? option.textContent.trim() : value;
}

// Check if a question has an answer (used for the progress counter)
function isAnswered(name) {
    const key = ANSWER_KEY[name];
    if (key.type === "text" || key.type === "select") {
        return form.elements[name].value.trim() !== "";
    }
    return form.querySelectorAll(`input[name="${name}"]:checked`).length > 0;
}

// ---------- Grading ----------

// Grade one question. Returns { correct, userAnswer, correctAnswer }
function gradeQuestion(name) {
    const key = ANSWER_KEY[name];
    let correct = false;
    let userAnswer = "";
    let correctAnswer = "";

    if (key.type === "text") {
        const typed = form.elements[name].value;
        correct = cleanText(typed).some(answer => key.accept.includes(answer));
        userAnswer = typed.trim();
        correctAnswer = key.display;

    } else if (key.type === "radio") {
        const checked = form.querySelector(`input[name="${name}"]:checked`);
        correct = checked !== null && checked.value === key.correct;
        userAnswer = checked ? optionText(name, checked.value) : "";
        correctAnswer = optionText(name, key.correct);

    } else if (key.type === "select") {
        const value = form.elements[name].value;
        correct = value === key.correct;
        userAnswer = value ? selectText(name, value) : "";
        correctAnswer = selectText(name, key.correct);

    } else if (key.type === "checkbox") {
        // All correct boxes must be checked and no wrong box checked
        const checked = [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(box => box.value);
        correct = checked.length === key.correct.length &&
                  key.correct.every(value => checked.includes(value));
        userAnswer = checked.map(value => optionText(name, value)).join("; ");
        correctAnswer = key.correct.map(value => optionText(name, value)).join("; ");
    }

    return { correct, userAnswer, correctAnswer };
}

// ---------- Timer ----------

function startTimer() {
    startTime = Date.now();
    timeLeftEl.textContent = formatClock(TIME_LIMIT_SECONDS);
    timerBar.classList.remove("warning");

    timerId = setInterval(function () {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(TIME_LIMIT_SECONDS - elapsed, 0);
        timeLeftEl.textContent = formatClock(remaining);

        // Turn the timer red during the last minute
        if (remaining <= 60) {
            timerBar.classList.add("warning");
        }

        // Time is up: submit automatically
        if (remaining === 0) {
            submitQuiz(true);
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerId);
    timerId = null;
}

// ---------- Progress counter ----------

function updateProgress() {
    const answered = Object.keys(ANSWER_KEY).filter(isAnswered).length;
    progressEl.textContent = answered + " of " + TOTAL_QUESTIONS + " answered";
}

// ---------- Main actions ----------

// Show the form and start the timer
function startQuiz() {
    finished = false;
    intro.classList.add("hidden");
    form.classList.remove("hidden");
    timerBar.classList.remove("hidden");
    updateProgress();
    startTimer();
    form.querySelector("input, select").focus();
}

// Grade the quiz and show the results
function submitQuiz(timeUp) {
    if (finished) return; // do not grade twice
    finished = true;
    stopTimer();

    // Time spent (never more than the time limit)
    const secondsUsed = Math.min(Math.round((Date.now() - startTime) / 1000), TIME_LIMIT_SECONDS);

    let score = 0;
    const rows = [];

    // Grade every question and color it on the page
    Object.keys(ANSWER_KEY).forEach(function (name, index) {
        const result = gradeQuestion(name);
        const fieldset = form.querySelector(`.question[data-q="${index + 1}"]`);
        const feedback = fieldset.querySelector(".feedback");

        if (result.correct) score++;

        fieldset.classList.add(result.correct ? "correct" : "incorrect");
        feedback.innerHTML = result.correct
            ? "&#10004; Correct!"
            : "&#10008; Incorrect. Correct answer: <strong>" + escapeHtml(result.correctAnswer) + "</strong>";

        rows.push({ number: index + 1, ...result });
    });

    // Lock the form so answers cannot change after submitting
    form.querySelectorAll("input, select").forEach(el => (el.disabled = true));
    submitBtn.classList.add("hidden");
    timerBar.classList.add("hidden");

    showResults(score, secondsUsed, rows, timeUp);
}

// Build the results panel at the top of the page
function showResults(score, secondsUsed, rows, timeUp) {
    const percent = Math.round((score / TOTAL_QUESTIONS) * 100);
    const passed = percent >= PASS_PERCENT;

    // One table row per question
    const tableRows = rows.map(row => `
        <tr class="${row.correct ? "row-correct" : "row-incorrect"}">
            <td>${row.number}</td>
            <td><span class="tag ${row.correct ? "tag-correct" : "tag-incorrect"}">
                ${row.correct ? "Correct" : "Incorrect"}</span></td>
            <td>${row.correct ? 1 : 0} / 1</td>
            <td>${row.userAnswer ? escapeHtml(row.userAnswer) : "<em>No answer</em>"}</td>
            <td>${escapeHtml(row.correctAnswer)}</td>
        </tr>`).join("");

    resultsBox.innerHTML = `
        <h2>Quiz Results</h2>
        ${timeUp ? '<p class="time-up">&#9200; Time is up! Your quiz was submitted automatically.</p>' : ""}

        <div class="result-summary ${passed ? "pass" : "fail"}">
            <div class="result-badge">${passed ? "PASS" : "FAIL"}</div>
            <div class="result-stats">
                <p><strong>Total score:</strong> ${score} / ${TOTAL_QUESTIONS} (${percent}%)</p>
                <p><strong>Time spent:</strong> ${formatDuration(secondsUsed)}</p>
                <p><strong>Passing score:</strong> ${PASS_PERCENT}%</p>
            </div>
        </div>

        <!-- Score bar: width shows the percentage -->
        <div class="score-bar"><div class="score-fill ${passed ? "pass" : "fail"}" style="width:${percent}%"></div></div>

        <div class="table-wrap">
            <table class="results-table">
                <tr><th>#</th><th>Result</th><th>Score</th><th>Your answer</th><th>Correct answer</th></tr>
                ${tableRows}
            </table>
        </div>

        <button type="button" class="btn btn-primary retake-btn">Retake Quiz</button>
    `;

    resultsBox.classList.remove("hidden");
    resultsBox.scrollIntoView({ behavior: "smooth" });
}

// Clear all inputs and results, then start again with a new timer
function resetQuiz() {
    stopTimer();
    form.reset();

    // Remove colors and feedback from every question
    form.querySelectorAll(".question").forEach(function (fieldset) {
        fieldset.classList.remove("correct", "incorrect");
        fieldset.querySelector(".feedback").innerHTML = "";
    });

    // Unlock inputs and bring back the submit button
    form.querySelectorAll("input, select").forEach(el => (el.disabled = false));
    submitBtn.classList.remove("hidden");

    // Clear the results panel
    resultsBox.innerHTML = "";
    resultsBox.classList.add("hidden");

    window.scrollTo({ top: 0, behavior: "smooth" });
    startQuiz();
}

// ---------- Event listeners ----------

startBtn.addEventListener("click", startQuiz);

form.addEventListener("submit", function (event) {
    event.preventDefault(); // stay on this page
    submitQuiz(false);
});

// Update the "answered" counter while the user works
form.addEventListener("input", updateProgress);
form.addEventListener("change", updateProgress);

// Retake/Reset buttons (one is created later inside the results panel,
// so we listen on the whole page)
document.addEventListener("click", function (event) {
    if (event.target.classList.contains("retake-btn")) {
        resetQuiz();
    }
});
