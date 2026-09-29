// 三个游戏共用的脚本。用普通 <script> 引入（不用 ES module），双击 file:// 打开也能运行。

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 移除再加回 class，保证快速连点时动画每次都会重新播放
function replayAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// ---------- 音效（Web Audio 合成，无需外部文件） ----------
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

// 每个音符：[频率 Hz, 开始时间 s, 时长 s]
const SOUNDS = {
  click: [[880, 0, 0.06]],
  tick: [[1400, 0, 0.02]],
  bump: [[180, 0, 0.15]],
  wrong: [
    [330, 0, 0.12],
    [247, 0.12, 0.2],
  ],
  carry: [
    [660, 0, 0.08],
    [990, 0.08, 0.14],
  ],
  borrow: [
    [990, 0, 0.08],
    [660, 0.08, 0.14],
  ],
  reset: [
    [660, 0, 0.08],
    [440, 0.08, 0.14],
  ],
  random: [
    [523, 0, 0.08],
    [659, 0.08, 0.08],
    [784, 0.16, 0.14],
  ],
  success: [
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.1],
    [1047, 0.3, 0.25],
  ],
};

// 必须在用户手势中调用，iOS 才会放行声音
function unlockAudio() {
  if (!AudioCtx) return;
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playSound(name) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  SOUNDS[name].forEach(([freq, start, duration]) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, now + start);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + start);
    osc.stop(now + start + duration);
  });
}

// ---------- 语音 ----------
const synth = window.speechSynthesis || null;
let speakTimer = null;

// 读完（或出错、被打断）时 resolve；不支持语音的浏览器直接 resolve
function speak(text, { rate = 0.8, pitch = 1 } = {}) {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = rate;
    utterance.pitch = pitch;
    // 兜底：部分浏览器被打断时不会回调 onend
    const fallback = setTimeout(done, 2000 + text.length * 400);
    function done() {
      clearTimeout(fallback);
      resolve();
    }
    utterance.onend = done;
    utterance.onerror = done;
    synth.speak(utterance);
  });
}

function stopSpeaking() {
  clearTimeout(speakTimer);
  if (synth) synth.cancel();
}

// 连续操作时只读最后一次
function speakSoon(text) {
  stopSpeaking();
  speakTimer = setTimeout(() => speak(text), 300);
}

function speakNumber(num) {
  speakSoon(numberToChinese(num));
}

const CN_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const CN_UNITS = ["", "十", "百", "千", "万"];

// 将数字转换为中文读法
function numberToChinese(num) {
  if (num === 0) return "零";

  let result = "";
  let unitIndex = 0;

  while (num > 0) {
    const digit = num % 10;
    if (digit !== 0) {
      result = CN_DIGITS[digit] + CN_UNITS[unitIndex] + result;
    } else if (result && result[0] !== "零") {
      result = "零" + result;
    }
    num = Math.floor(num / 10);
    unitIndex++;
  }

  // 十几读作"十几"而不是"一十几"
  return result.replace(/^一十/, "十");
}

// ---------- 启动层：浏览器要求用户先点一下才允许发声 ----------
// onStart：欢迎语之后要接着读的内容（比如第一道题），可省略
function setupStartScreen({ emoji, title, welcome, onStart }) {
  const screen = document.createElement("div");
  screen.className = "start-screen";
  screen.innerHTML = `
    <div class="start-emoji">${emoji}</div>
    <div class="start-title">${title}</div>
    <button class="button start-button" id="startButton">点击开始</button>
  `;
  document.body.appendChild(screen);
  $("startButton").addEventListener("click", () => {
    unlockAudio();
    speak(welcome, { rate: 0.9 });
    screen.remove();
    if (onStart) onStart();
  });
}

// ---------- 飞行动画：一个元素从 fromEl 的位置飞到 toEl 的位置 ----------
// container 需要是 position: relative；返回飞完时 resolve 的 Promise
function flyElement(fromEl, toEl, { container, className = "", fromColor, toColor, duration = 450 }) {
  const box = container.getBoundingClientRect();
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "flying " + className;
  el.style.position = "absolute";
  el.style.zIndex = "50";
  el.style.pointerEvents = "none";
  el.style.margin = "0";
  el.style.left = a.left - box.left + "px";
  el.style.top = a.top - box.top + "px";
  el.style.width = a.width + "px";
  el.style.height = a.height + "px";
  if (fromColor) el.style.backgroundColor = fromColor;
  el.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1), background-color ${duration}ms`;
  container.appendChild(el);
  void el.offsetWidth;
  el.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px)`;
  if (toColor) el.style.backgroundColor = toColor;
  return wait(duration).then(() => el.remove());
}

// ---------- 闯关进度 ----------
// 约定页面上有 #levelMap、#levelName、#levelStars；进度保存在 localStorage
// onSelect(index)：孩子点了另一个已解锁的关卡
function createLevelProgress({ storageKey, levels, starsToPass = 5, onSelect }) {
  const last = levels.length - 1;
  const progress = {
    levels,
    starsToPass,
    current: 0,
    unlocked: 0, // 已解锁的最高关卡下标
    stars: levels.map(() => 0), // 每关已得星星数

    get level() {
      return levels[this.current];
    },

    isLast() {
      return this.current === last;
    },

    intro() {
      return `第${this.current + 1}关，${this.level.name}`;
    },

    save() {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ currentLevel: this.current, unlocked: this.unlocked, progress: this.stars })
        );
      } catch (e) {
        // 隐私模式等情况下无法保存，不影响游戏
      }
    },

    setCurrent(index) {
      this.current = index;
      this.save();
      this.render(false);
    },

    // 记一颗星；这颗星让本关刚好过关时解锁下一关并返回 true
    earnStar() {
      if (this.stars[this.current] >= starsToPass) return false;
      this.stars[this.current]++;
      const passed = this.stars[this.current] === starsToPass;
      if (passed) this.unlocked = Math.max(this.unlocked, Math.min(this.current + 1, last));
      this.save();
      this.render(true);
      return passed;
    },

    render(newStar) {
      $("levelMap").innerHTML = levels
        .map((level, i) => {
          const locked = i > this.unlocked;
          let className = "level-dot";
          if (i === this.current) className += " current";
          if (this.stars[i] >= starsToPass) className += " passed";
          const label = `第${i + 1}关 ${level.name}${locked ? "（未解锁）" : ""}`;
          return `<button class="${className}" data-level="${i}" aria-label="${label}"${
            locked ? " disabled" : ""
          }>${locked ? "🔒" : i + 1}</button>`;
        })
        .join("");

      $("levelName").textContent = `第${this.current + 1}关 · ${this.level.name}`;

      const stars = this.stars[this.current];
      let html = "";
      for (let i = 0; i < starsToPass; i++) {
        let className = "star";
        if (i < stars) className += " on";
        if (newStar && i === stars - 1) className += " earned";
        html += `<span class="${className}">⭐</span>`;
      }
      $("levelStars").innerHTML = html;
    },
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) {
      const clamp = (n, max) => Math.max(0, Math.min(max, Math.floor(Number(n)) || 0));
      progress.unlocked = clamp(saved.unlocked, last);
      progress.current = Math.min(clamp(saved.currentLevel, last), progress.unlocked);
      progress.stars = levels.map((_, i) => clamp(saved.progress && saved.progress[i], starsToPass));
    }
  } catch (e) {
    // 读不到就从第一关开始
  }

  $("levelMap").addEventListener("click", (e) => {
    const button = e.target.closest(".level-dot");
    if (!button || button.disabled) return;
    const index = Number(button.dataset.level);
    if (index !== progress.current) onSelect(index);
  });

  progress.render(false);
  return progress;
}

// ---------- 答对后的庆祝 ----------
const PRAISE = "太棒了！你完成了任务！请完成下一个任务";
const PRAISE_VOICE = { rate: 1, pitch: 1.1 };

// 约定页面上有 #mascotOverlay、#mascot
function showMascot(emoji) {
  $("mascot").textContent = emoji;
  $("mascotOverlay").classList.add("active");
}

function hideMascot() {
  $("mascotOverlay").classList.remove("active");
}

// 通用流程：读出答案 → 表扬（集满星星就进入下一关）→ 出下一题并读出 → 收起遮罩
// isCurrent() 返回 false 表示流程已被打断（切关、关闭模式等），此时立即退出
// earn：这题是否算一颗星；正常走完返回 true
async function celebrate(progress, { answerText, enterLevel, nextTask, taskText, isCurrent, earn = true }) {
  stopSpeaking();
  const levelUp = earn ? progress.earnStar() : false;
  playSound("success");
  showMascot(levelUp ? "🏆" : "👏");
  const minShow = wait(1500); // 没有语音时遮罩也至少展示一会儿

  await speak(answerText);
  if (!isCurrent()) return false;

  if (levelUp && !progress.isLast()) {
    await speak(`太棒了！第${progress.current + 1}关通过啦！`, PRAISE_VOICE);
    if (!isCurrent()) return false;
    enterLevel(progress.current + 1);
    await speak(progress.intro());
  } else {
    await speak(levelUp ? "太棒了！你通过了所有关卡！" : PRAISE, PRAISE_VOICE);
    if (!isCurrent()) return false;
    nextTask();
  }
  if (!isCurrent()) return false;
  await speak(taskText());
  await minShow;
  if (!isCurrent()) return false;

  hideMascot();
  return true;
}
