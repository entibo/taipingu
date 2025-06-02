import { Matcher } from './matcher.js'
import { getLanguages, makeSentenceProvider } from './sentences/tatoeba/api.js'

/** @type {Matcher} */
let matcher

/** @type {ReturnType<import('./sentences/tatoeba/shared.mjs').parseSentenceObject>} */
let sentence
let promisedNextSentence
let sentenceProvider

let wasFuriganaRevealed

async function setSentence(value) {
  sentence = value

  wasFuriganaRevealed = false
  if (settings.unknownReadings === 1 && settings.furigana) {
    // Disable Furigana
    furiganaCheckbox.click()
  }

  window.sentence = sentence
  console.log(sentence)

  matcher = new Matcher(
    sentence.parts.map((part) => part.transcription || part.text).join(''),
  )
  window.matcher = matcher

  hintElement.animate([{ opacity: 0 }, {}], {
    duration: 300,
    easing: 'ease-in',
  })

  renderSentence()
  renderTranslation()
  renderMenu()

  if (settings.audio && sentence.audio) {
    loadAudio()
    playAudio()
  }

  restartButton.classList.toggle('hidden', true)
}

function resetSentence() {
  matcher.reset()
  restartButton.classList.toggle('hidden', true)
  renderSentenceProgress()
}

async function nextSentence() {
  if (promisedNextSentence) return
  promisedNextSentence = sentenceProvider.next()
  try {
    setSentence(await promisedNextSentence)
  } finally {
    promisedNextSentence = null
  }

  // document.documentElement.style.filter = `hue-rotate(${
  //   Math.random() * 360
  // }deg)`
}

function onInputMistake(key) {
  // Animate: scale down and turn red
  hintElement.animate(
    [
      {
        marginTop: '0',
        backgroundColor: 'var(--error)',
        // color: 'var(--error)',
        // borderColor: 'var(--error)',
      },
      {
        marginTop: '0.06em',
        scale: '0.9',
        // color: 'var(--error)',
        backgroundColor: 'var(--error)',
      },
      {},
    ],
    {
      duration: 300,
      easing: 'cubic-bezier(0.050, 0.445, 0.950, 0.550)',
      // composite: 'accumulate',
    },
  )

  // Animate: shake
  hintElement.animate(
    [
      { marginLeft: '3px', rotate: '-20deg' },
      { marginLeft: '-3px', rotate: '15deg' },
      { marginLeft: '2px', rotate: '-10deg' },
      { marginLeft: '-1px', rotate: '5deg' },
    ],
    {
      duration: 200,
      easing: 'ease-in-out',
      // composite: 'accumulate',
    },
  )
}

/** Used to calculate typing speed */
let firstInputTimeMS

function onCompleteSentence() {
  // See if the user typed an unknown word
  if (!wasFuriganaRevealed) {
    let anyNewReadings = false
    for (const reading of sentence.readings) {
      if (!settings.knownReadings.includes(reading)) {
        settings.knownReadings.push(reading)
        anyNewReadings = true
      }
    }
    if (anyNewReadings) {
      saveSettings(settings)
      // renderSentence()
    }
  }

  // Hide then fade back in to hide transformation to ⏎ arrow
  hintElement.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 100,
    easing: 'ease-in',
    delay: 50,
    fill: 'backwards',
  })

  // Calculate and display the typing speed in WPM
  // words per minute, 1 word = 5 keystrokes
  // this is the standard metric for typing tests

  const delayMins = (Date.now() - firstInputTimeMS) / (1000 * 60)
  const words = matcher.keystrokes.length / 5
  const wpm = Math.round(words / delayMins)
  restartButton.classList.toggle('hidden', false)

  // Set the property in case animation isn't supported
  restartButton.style.setProperty('--wpm', wpm)

  // WPM thresholds for background and text color
  const frames = [0, 20, 40, 60, 80, 100, 120]
    .filter((x) => x <= wpm)
    .map((x, i) => ({
      offset: x / wpm,
      backgroundColor: `var(--wpm-${i}-background)`,
      color: `var(--wpm-${i}-text)`,
      ...(i === 0 ? {} : { outlineColor: `transparent` }),
    }))

  // First frame has 0 wpm, last frame has {wpm} wpm
  frames[0]['--wpm'] = 0
  frames.push({ ...frames.at(-1), offset: 1, '--wpm': wpm })

  restartButton.animate(frames, {
    duration: 1000 + wpm * 10,
    fill: 'forwards',
    easing: 'cubic-bezier(.99,.92,.33,.96)',
  })
}

window.onInput = onInput
function onInput(key) {
  if (matcher.completed) return

  const isFirstInput = matcher.keystrokes.length === 0

  if (!matcher.input(key)) {
    onInputMistake(key)
    return
  }

  renderSentenceProgress()

  if (isFirstInput) firstInputTimeMS = Date.now()
  if (matcher.completed) onCompleteSentence()

  // Animate: scale down
  hintElement.animate([{ scale: 0.9 }, {}], {
    duration: 100,
    easing: 'ease-out',
    // composite: 'accumulate',
  })

  // Animate: bounce up
  hintElement.animate(
    [
      {},
      {
        marginTop: '-0.15em',
        scale: 1.15,
      },
      { marginTop: '0' },
    ],
    {
      duration: 200,
      easing: 'cubic-bezier(.43,.91,.41,.2)',
      composite: 'accumulate',
    },
  )
}

function renderSentence() {
  sentenceElement.innerHTML = ''
  for (const part of sentence.parts) {
    function makeInputTarget(char) {
      const span = document.createElement('span')
      span.dataset.target = char
      span.textContent = char
      return span
    }

    if (part.transcription) {
      const ruby = document.createElement('ruby')
      const partText = document.createElement('span')
      partText.classList.add('text')
      partText.classList.toggle(
        'unknown',
        part.reading &&
          settings.unknownReadings === 1 &&
          !settings.knownReadings.includes(part.reading),
      )
      partText.textContent = part.text
      ruby.append(partText)
      const rt = document.createElement('rt')
      for (const character of part.transcription) {
        rt.append(makeInputTarget(character))
      }
      ruby.append(rt)
      sentenceElement.append(ruby)
    } else {
      const partText = makeInputTarget(part.text)
      partText.classList.add('text')
      sentenceElement.append(partText)
    }
  }
  renderSentenceProgress()
  preventSentenceOverflow()
  preventRubyOverlap()
}

/** Set classes, move hint, set highlight width */
function renderSentenceProgress() {
  const containerRect = sentenceContainer.getBoundingClientRect()

  sentenceContainer.classList.toggle('complete', matcher.completed)

  const targets = sentenceElement.querySelectorAll('[data-target]')
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]

    target.classList.toggle('complete', i < matcher.japaneseIndex)
    target.classList.toggle('active', i === matcher.japaneseIndex)
  }

  /* NOTE: getBoundingClientRect() accounts for CSS scale,
           while offsetLeft and offsetWidth do not 
  */

  if (matcher.completed) {
    const lastComplete = sentenceElement.querySelector('&>.complete:last-child')
    const lastCompleteRect = lastComplete.getBoundingClientRect()
    hintElement.style.setProperty(
      '--hint-x',
      `${lastCompleteRect.right - containerRect.x - 10}px`,
    )
    hintElement.dataset.letter = ''
  } else {
    hintElement.dataset.letter = matcher.hint
  }

  const activeTarget = sentenceElement.querySelector('.active')
  if (activeTarget) {
    const activeTargetRect = activeTarget.getBoundingClientRect()
    const x = activeTargetRect.x + activeTargetRect.width / 2

    hintElement.style.setProperty('--hint-x', `${x - containerRect.x}px`)

    let doesItNeedToBeHigher = false
    for (const rt of sentenceElement.querySelectorAll('rt')) {
      const rtRect = rt.getBoundingClientRect()
      if (rtRect.left < x + 10 && x - 10 < rtRect.right) {
        doesItNeedToBeHigher = true
      }
    }
    hintElement.classList.toggle('higher', doesItNeedToBeHigher)
  }

  const lastComplete = Array.from(
    sentenceElement.querySelectorAll(
      '&>.complete, ruby:has(.complete:last-child)',
    ),
  ).at(-1)
  if (lastComplete) {
    const width = lastComplete.offsetLeft + lastComplete.offsetWidth
    highlightElement.style.width = `${width}px`
  } else {
    highlightElement.style.width = '0'
  }

  restartButton.disabled = matcher.keystrokes.length === 0
}

/** The container can fit up to 20 characters (at font-size: 40px) */
function preventSentenceOverflow() {
  const scale = Math.min(1, 20 / sentence.text.length)
  sentenceContainer.style.setProperty('--scale', scale)
}

/** Push ruby "rt" elements apart until there is no overlap */
function preventRubyOverlap() {
  const elements = Array.from(sentenceElement.querySelectorAll('rt')).map(
    (element) => {
      const rect = element.getBoundingClientRect()
      return {
        element,
        width: rect.width,
        startX: rect.x,
        x: rect.x,
      }
    },
  )
  let iterationCount = 0
  const maxIterations = 500
  let doesOverlap = true
  while (doesOverlap && iterationCount++ < maxIterations) {
    doesOverlap = false

    for (let i = 0; i < elements.length - 1; i++) {
      const a = elements[i]
      const b = elements[i + 1]

      const aRight = a.x + a.width
      const bLeft = b.x

      if (aRight > bLeft) {
        doesOverlap = true
        const overlapAmount = aRight - bLeft
        a.x -= overlapAmount / 2
        b.x += overlapAmount / 2
      }
    }
  }

  for (const element of elements) {
    element.element.style.setProperty(
      '--overlap-adjustment',
      `${element.x - element.startX}px`,
    )
  }
}

// addEventListener('resize', renderSentence)

function loadAudio() {
  audioElement.innerHTML = ''
  for (const url of sentence.audio.sources) {
    const sourceElement = document.createElement('source')
    sourceElement.src = url
    audioElement.append(sourceElement)
  }
  audioElement.load()
}

function renderMenu() {
  // Tatoeba link
  if (sentence.id) {
    sentenceOriginLink.href = `https://tatoeba.org/en/sentences/show/${sentence.id}`
    sentenceIdElement.textContent = sentence.id
  } else {
    sentenceOriginLink.removeAttribute('href')
  }
}

function renderSettings() {
  document.body.classList.toggle('furigana', settings.furigana)
  document.body.classList.toggle('mincho', settings.mincho)

  sentenceProvider.count().then((count) => {
    // sentenceCountElement.textContent = count.toLocaleString()
    sentenceCountElement.animate(
      [
        {
          '--sentence-count': parseInt(
            sentenceCountElement.style.getPropertyValue('--sentence-count'),
          ),
        },
        { '--sentence-count': count },
      ],
      { duration: 500, fill: 'forwards' },
    )
    sentenceCountElement.style.setProperty('--sentence-count', count)
  })
}

furiganaCheckbox.addEventListener('change', () => {
  saveSettings({ ...settings, furigana: furiganaCheckbox.checked })
})

translationCheckbox.addEventListener('change', () => {
  saveSettings({ ...settings, translationEnabled: translationCheckbox.checked })
})

audioCheckbox.addEventListener('change', () => {
  saveSettings({ ...settings, audio: audioCheckbox.checked })

  if (audioCheckbox.checked) enableAudio()
})

fontCheckbox.addEventListener('change', () => {
  saveSettings({ ...settings, mincho: fontCheckbox.checked })
})

for (const radio of document.querySelectorAll(
  'input[name="unknownReadings"]',
)) {
  radio.addEventListener('change', () => {
    saveSettings({ ...settings, unknownReadings: JSON.parse(radio.value) })

    if (settings.unknownReadings !== null) {
      const currentSentenceUnknownReadings = sentence.readings.filter(
        (reading) => !settings.knownReadings.includes(reading),
      )
      if (currentSentenceUnknownReadings.length !== settings.unknownReadings) {
        nextSentence()
      }
    }
  })
}

addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text')
    return

  const { key, ctrlKey, metaKey, shiftKey } = e
  console.log(key)

  if (key === 'Tab') {
    furiganaCheckbox.click()
    simulateButtonPress(furiganaCheckbox.closest('.button'))
    e.preventDefault()
    return
  }

  if (key === 'Enter') {
    nextSentence()
    simulateButtonPress(nextSentenceButton.closest('.button'))
    e.preventDefault()
    return
  }

  if (key === 'Escape' || key === 'Backspace' || key === 'Delete') {
    resetSentence()
    return
  }

  if (ctrlKey || metaKey) return

  if (key === ' ') {
    e.preventDefault()
    if (shiftKey) {
      if (audioCheckbox.checked) audioCheckbox.click()
    } else {
      if (audioCheckbox.checked) playAudio()
      else audioCheckbox.click()
    }
    simulateButtonPress(audioCheckbox.closest('.button'))
    return
  }

  if (key.length === 1) {
    e.preventDefault()
    onInput(key)
    return
  }
})

function simulateButtonPress(button) {
  button.animate([{ scale: 0.98, translate: '0 2px' }, {}], {
    duration: 300,
    easing: 'ease-in',
  })
}

// SETTINGS

let settings = {
  language: 'eng',
  translationEnabled: true,
  furigana: true,
  audio: false,
  mincho: false,
  /** @type {null | 0 | 1} */
  unknownReadings: null,
  knownReadings: [],
}

function _setSettings(value) {
  settings = value

  sentenceProvider = makeSentenceProvider(settings)

  renderSettings()
}

function loadSettings() {
  const storedSettings = localStorage.getItem('taipingu')
  if (storedSettings !== null) {
    settings = { ...settings, ...JSON.parse(storedSettings) }
  }

  audioCheckbox.checked = settings.audio
  furiganaCheckbox.checked = settings.furigana
  fontCheckbox.checked = settings.mincho
  document.querySelector(
    `input[name="unknownReadings"][value="${settings.unknownReadings}"]`,
  ).checked = true
  translationCheckbox.checked = settings.translationEnabled
  initializeLanguageSelect(settings.language)

  _setSettings(settings)
}

function saveSettings(newSettings) {
  localStorage.setItem('taipingu', JSON.stringify(newSettings))
  _setSettings(newSettings)

  if (newSettings.furigana) wasFuriganaRevealed = true
}

// TRANSLATION

const languagesPromise = getLanguages()

async function getLanguageName(lang) {
  const languages = await languagesPromise
  return languages.find((l) => l.lang === lang)?.name ?? '?'
}

const selectOptionsPromise = languagesPromise.then((languages) => {
  for (const { lang, name } of languages.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const optionElement = document.createElement('option')
    optionElement.value = lang
    optionElement.label = name
    languageSelect.append(optionElement)
  }
})

async function initializeLanguageSelect(lang) {
  await selectOptionsPromise
  languageSelect.value = lang
}

languageSelect.addEventListener('change', () => {
  // Language was changed, make sure translation is enabled
  if (!settings.translationEnabled) {
    translationCheckbox.click()
    simulateButtonPress(translationCheckbox.closest('.button'))
  }

  setTranslationLanguage(languageSelect.value)
})

function setTranslationLanguage(language) {
  if (settings.language === language) return
  saveSettings({ ...settings, language })
  renderTranslation()
}

async function renderTranslation() {
  const language = settings.language
  if (language === '') {
    translationElement.textContent = ''
    return
  }

  translationElement.textContent =
    sentence.translations[language] ??
    `${await getLanguageName(language)} translation will go here.`
}

// BUTTONS

restartButton.addEventListener('click', resetSentence)
nextSentenceButton.addEventListener('click', nextSentence)

// AUDIO

const audioElement = document.createElement('audio')
let audioMessageTimeout
function showAudioMessage(message, duration = 4000) {
  clearTimeout(audioMessageTimeout)
  sentenceVoiceElement.textContent = message
  sentenceVoiceContainer.classList.toggle('hidden', false)
  audioMessageTimeout = setTimeout(() => {
    sentenceVoiceContainer.classList.toggle('hidden', true)
  }, duration)
}
audioElement.addEventListener('play', () => {
  clearTimeout(audioMessageTimeout)
  sentenceVoiceElement.textContent = sentence.audio.author
  sentenceVoiceContainer.classList.toggle('hidden', false)
})
audioElement.addEventListener('pause', () => {
  clearTimeout(audioMessageTimeout)
  sentenceVoiceContainer.classList.toggle('hidden', true)
})

function playAudio() {
  if (sentence.audio) {
    audioElement.currentTime = 0
    audioElement.play()
  } else showAudioMessage('No audio')
}

function enableAudio() {
  if (sentence.audio) {
    loadAudio()
    playAudio()
  } else {
    // showAudioMessage('Next sentence will be loaded with audio')
    nextSentence()
  }
}

//

document.fonts.ready.then((fontFaceSet) => {
  document.body.classList.remove('loading')
  renderSentence()
  setTimeout(async () => {
    await fontFaceSet.load('1em noto-sans')
    await fontFaceSet.load('1em noto-serif')
  }, 1000)
})

loadSettings()

setSentence({
  text: 'これは日本語のタイピングゲームです。',
  parts: [
    { text: 'こ' },
    { text: 'れ' },
    { text: 'は' },
    { text: '日', transcription: 'に' },
    { text: '本', transcription: 'ほん' },
    { text: '語', transcription: 'ご' },
    { text: 'の' },
    { text: 'タ' },
    { text: 'イ' },
    { text: 'ピ' },
    { text: 'ン' },
    { text: 'グ' },
    { text: 'ゲ' },
    { text: 'ー' },
    { text: 'ム' },
    { text: 'で' },
    { text: 'す' },
    { text: '。' },
  ],
  translations: { eng: 'This is a Japanese typing game.' },
  readings: [],
})
