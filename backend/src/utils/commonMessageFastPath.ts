/**
 * Common Message Fast-Path Utility
 * Comprehensive map with ~1k common words, category-wise
 * All words stored lowercase, no spaces
 * Each category has 5-10 replies + 4-5 titles
 */

export type FastPathCategory = 
  | 'greeting' 
  | 'thanks' 
  | 'bye' 
  | 'ack' 
  | 'how_are_you'
  | 'yes'
  | 'no'
  | 'maybe'
  | 'apology'
  | 'compliment'
  | 'encouragement'
  | 'time_greeting'
  | 'wellbeing_check';

/**
 * Comprehensive Common Words Map
 * ~1k words/phrases organized by category
 * All words stored lowercase, no spaces
 */
export const COMMON_WORDS_MAP: Record<FastPathCategory, {
  words: Set<string>;
  replies: {
    formal: string[];
    casual: string[];
    neutral: string[];
  };
  titles: string[];
}> = {
  greeting: {
    words: new Set([
      // Single words
      'hi', 'hii', 'hey', 'hello', 'hlo', 'hullo', 'yo', 'sup', 'wassup', 'watsup', 'whatsup',
      'greetings', 'greeting', 'gm', 'morning', 'mornin', 'evening', 'eve', 'afternoon', 'aft',
      'night', 'nite', 'hola', 'bonjour', 'ciao', 'namaste', 'namaskar', 'howdy', 'heyya',
      // Multi-word phrases: NO SPACES
      'goodmorning', 'goodevening', 'goodafternoon', 'goodnight', 'goodday', 'gday',
      'hithere', 'heythere', 'hellothere', 'hifriend', 'heyfriend', 'hibro', 'heybro',
      'hiyaar', 'heyyaar', 'ramram', 'jaishreeram', 'jaishrikrishna',
      'kyahaal', 'kyahal', 'kyascene', 'kyachalraha', 'kyachalrha', 'kyachalra', 'kyachal',
      'kaiseho', 'kaisehoaap', 'kaisehobhai', 'kaisehoyaar',
      'welcomeback', 'longtimenosee', 'longtime', 'itsbeenawhile',
      'goodtoseeyou', 'nicetoseeyou', 'gladtoseeyou', 'pleasedtomeetyou',
      'helloworld', 'helloeveryone', 'helloguys', 'hellopeople',
      'whatsup', 'wassup', 'watsup', 'whatsgoingon', 'whatshappening',
      'howareyou', 'howru', 'howrudoing', 'howareyadoing', 'howyadoing',
      'howseverything', 'howslife', 'howsitgoing', 'howstheday',
      'heyho', 'yoyo', 'supman', 'supbro', 'supdude', 'supbuddy', 'supfriend',
      'heybuddy', 'heyfriend', 'heypal', 'heymate', 'heydude',
      'hibuddy', 'hifriend', 'hipal', 'himate', 'hidude',
      'goodmorningeveryone', 'goodmorningall', 'morningall', 'morningeveryone',
      'goodafternooneveryone', 'goodeveningeveryone', 'goodnighteveryone',
      'namaskaram', 'pranam', 'pranaam', 'salam', 'salaam',
      'konnichiwa', 'ohayo', 'ohayogozaimasu', 'konbanwa',
      'gutenmorgen', 'gutenabend', 'gutenacht',
      'buongiorno', 'buonasera', 'buonanotte',
      'holaamigo', 'holaamiga', 'holaamigos',
      'heyguys', 'heygirls', 'heyall', 'heyeveryone', 'heyfolks',
      'higuys', 'higirls', 'hiall', 'hieveryone', 'hifolks',
      'helloguys', 'hellogirls', 'helloall', 'helloeveryone', 'hellofolks',
      'topofthemorning', 'riseandshine', 'morningbeautiful', 'morninghandsome',
      'heybeautiful', 'heyhandsome', 'heygorgeous', 'heycute',
      'hibeautiful', 'higorgeous', 'hicute',
      'heyqueen', 'heyking', 'heyboss', 'heychief',
      'hiqueen', 'hiking', 'hiboss', 'hichief',
      'heyrockstar', 'heychamp', 'heylegend', 'heystar',
      'hirockstar', 'hichamp', 'hilegend', 'histar',
      'heywarrior', 'heyhero', 'heychampion', 'heywinner',
      'hiwarrior', 'hihero', 'hichampion', 'hiwinner',
      'heybud', 'heypal', 'heymate', 'heychum', 'heyfella',
      'hibud', 'hipal', 'himate', 'hichum', 'hifella',
      'heyfam', 'heyfamily', 'heycrew', 'heysquad', 'heyteam',
      'hifam', 'hifamily', 'hicrew', 'hisquad', 'hiteam',
      'heybestie', 'heybestfriend', 'heybff', 'heybestbud',
      'hibestie', 'hibestfriend', 'hibff', 'hibestbud',
      'heyhomie', 'heyhomeboy', 'heyhomegirl',
      'hihomie', 'hihomeboy', 'hihomegirl',
      'heysweetheart', 'heysweetie', 'heydarling', 'heydear',
      'hisweetheart', 'hisweetie', 'hidarling', 'hidear',
      'heyangel', 'heylove', 'heyhoney',
      'hiangel', 'hilove', 'hihoney',
      'heycutie', 'heybabes', 'heybaby', 'heybabe',
      'hicutie', 'hibabes', 'hibaby', 'hibabe',
      'heysunshine', 'heymoonlight', 'heystar', 'heysparkle',
      'hisunshine', 'himoonlight', 'histar', 'hisparkle',
      // More variations
      'hii', 'hiii', 'hiiii', 'heyy', 'heyyy', 'helloo', 'hellooo',
      'hiiii', 'heyyyy', 'helloooo', 'yooo', 'yoooo',
      'salam', 'salaam', 'adab', 'adaab',
      'vanakkam', 'namaskaram', 'pranam', 'pranaam',
      'satsriakal', 'sat sri akal', 'waheguru',
      'jai shri ram', 'jai shri krishna', 'jai mata di',
      'radhe radhe', 'har har mahadev',
      'assalamu alaikum', 'wa alaikum assalam',
      'goodmorning', 'goodafternoon', 'goodevening', 'goodnight',
      'gm', 'ga', 'ge', 'gn',
      'morning', 'afternoon', 'evening', 'night',
      'morn', 'aft', 'eve', 'nite',
    ]),
    replies: {
      formal: [
        'Hello.',
        'Good day.',
        'Greetings.',
        'Hello there.',
        'Good day to you.',
        'Greetings to you.',
        'Hello, how are you?',
        'Good day, how are you?',
      ],
      casual: [
        "Hey! What's up?",
        'Hey!',
        "Hi! What's going on?",
        'Yo! What\'s up?',
        'Hey hey, what\'s up?',
        'Sup! How\'s it going?',
        'Hey there! What\'s happening?',
        'Hi! How\'s everything?',
      ],
      neutral: [
        'Hi.',
        'Hello.',
        "Hey! What's up?",
        'Hi there.',
        'Hello there.',
        'Hi.',
        'Hello. Nice to hear from you.',
      ],
    },
    titles: ['Hello', 'Hi there', 'Greetings', 'Hey', 'Quick chat'],
  },

  thanks: {
    words: new Set([
      // Single words
      'thanks', 'thx', 'ty', 'tysm', 'thankyou', 'thanku', 'thnks', 'thnx',
      'thanx', 'thnku', 'appreciate', 'grateful', 'shukriya', 'shukria', 'shukriyaa',
      'dhanyawad', 'dhanyavaad', 'dhanyavad', 'merci', 'gracias', 'danke', 'arigato', 'grazie',
      // Multi-word phrases: NO SPACES
      'thankyou', 'thankuso', 'thankusomuch', 'thanksalot', 'thanksaton',
      'thanksabunch', 'thanksamillion', 'muchappreciated', 'appreciateit',
      'thanksbuddy', 'thanksbro', 'thanksyaar', 'thanksfriend',
      'thankyouverymuch', 'thankyousomuch', 'thanksalot',
      'shukriyabhai', 'dhanyawadbhai', 'thanksbhai',
      'tyvm', 'tysm', 'thnx', 'thnks',
      'bigthanks', 'manythanks', 'thanksagain', 'thanksalot',
      'thankyouverymuch', 'thankyousomuch', 'thanksaton',
      'thanksabunch', 'thanksamillion', 'thanksagain',
      'muchappreciated', 'appreciateit', 'appreciated',
      'grateful', 'gratefully', 'gratitude',
      'thanksmate', 'thankspal', 'thanksbuddy', 'thanksfriend',
      'thanksbro', 'thankssis', 'thanksdude', 'thanksman',
      'thanksgirl', 'thanksguy', 'thanksfolks', 'thanksall',
      'thanksguys', 'thanksgirls', 'thankspeople', 'thankseveryone',
      'thanksfam', 'thanksfamily', 'thankscrew', 'thanksteam',
      'thankssquad', 'thanksgang', 'thanksgroup', 'thanksbunch',
      'thankslot', 'thanksheap', 'thanksbundle', 'thanksload',
      'thanksmillion', 'thanksbillion', 'thanksworld',
      'thanksheaps', 'thanksbunches', 'thanksloads',
      'thanksmuch', 'thanksverymuch', 'thankssomuch',
      'thanksagain', 'thanksalotagain', 'thankssomuchagain',
      'thanksanyway', 'thanksanyhow', 'thanksregardless',
      'thanksinadvance', 'thanksahead', 'thanksbeforehand',
      'thanksnow', 'thankshere', 'thanksthere',
      'thanksforeverything', 'thanksforall', 'thanksforallofit',
      'thanksforallthehelp', 'thanksforallthesupport',
      'thanksforallthelove', 'thanksforallthecare',
      'thanksforallthekindness', 'thanksforallthepatience',
      // More variations
      'thnx', 'thnks', 'thnku', 'thnq', 'thnkq',
      'tyvm', 'tysm', 'tyty', 'tytyty',
      'thanksagain', 'thanksalotagain', 'thankssomuchagain',
      'thanksanyway', 'thanksanyhow', 'thanksregardless',
      'thanksinadvance', 'thanksahead', 'thanksbeforehand',
      'thanksnow', 'thankshere', 'thanksthere',
      'thanksbro', 'thankssis', 'thanksdude', 'thanksman',
      'thanksgirl', 'thanksguy', 'thanksfolks', 'thanksall',
      'thanksguys', 'thanksgirls', 'thankspeople', 'thankseveryone',
      'thanksfam', 'thanksfamily', 'thankscrew', 'thanksteam',
      'thankssquad', 'thanksgang', 'thanksgroup', 'thanksbunch',
      'thankslot', 'thanksheap', 'thanksbundle', 'thanksload',
      'thanksmillion', 'thanksbillion', 'thanksworld',
      'thanksheaps', 'thanksbunches', 'thanksloads',
      'thanksmuch', 'thanksverymuch', 'thankssomuch',
      'shukriyabhai', 'dhanyawadbhai', 'thanksbhai',
      'shukriyayaar', 'dhanyawadyaar', 'thanksyaar',
      'shukriyafriend', 'dhanyawadfriend', 'thanksfriend',
    ]),
    replies: {
      formal: [
        "You're welcome.",
        "You're very welcome.",
        'My pleasure.',
        'Glad to hear it.',
        'Happy to hear that.',
        'You\'re most welcome.',
        'Anytime.',
      ],
      casual: [
        'No problem!',
        'Anytime!',
        "You got it!",
        'Sure thing!',
        'No worries at all!',
        'All good!',
        'No biggie!',
        'Of course!',
      ],
      neutral: [
        "You're welcome!",
        'No worries!',
        'Glad to hear it!',
        'My pleasure!',
        'You\'re welcome! Anytime.',
        'Happy to hear that.',
      ],
    },
    titles: ['Thanks', 'Appreciation', 'Gratitude', 'Thank you', 'Acknowledgment'],
  },

  bye: {
    words: new Set([
      // Single words
      'bye', 'byee', 'goodbye', 'byebye', 'cya', 'ttyl', 'gn', 'night', 'nite', 'n8',
      'farewell', 'adios', 'cheers', 'later', 'laters', 'tata', 'alvida', 'milte', 'milenge',
      // Multi-word phrases: NO SPACES
      'byebye', 'seeya', 'seeyou', 'seeyoulater', 'seeyasoon', 'seeyaround',
      'catchyalater', 'catchyoulater', 'talktoyoulater', 'talklater',
      'haveagoodone', 'haveagoodday', 'haveaniceday',
      'takecare', 'tc', 'takecareofyourself', 'staysafe',
      'goodnight', 'sweetdreams',
      'seeyoutomorrow', 'seeyousoon', 'untilnexttime',
      'phirmilenge', 'phirmilte', 'phirmiltehain', 'miltehain',
      'byebhai', 'byeyaar', 'byebuddy', 'byefriend',
      'seeyoulateralligator', 'inawhilecrocodile',
      'goodbyefornow', 'goodbyefornow', 'seeyouaround',
      'catchyoulater', 'talktoyousoon', 'talktoyoulater',
      'latersgators', 'latersalligator', 'seeyousoon',
      'untilnexttime', 'untilwemeetagain', 'untilnextime',
      'goodbyemyfriend', 'goodbyebuddy', 'goodbyepal',
      'seeyouthen', 'seeyouthere', 'seeyouwhen',
      'takeiteasy', 'takecareofyourself', 'takecarebuddy',
      'haveagreatday', 'haveawonderfulday', 'haveaniceday',
      'haveagoodone', 'haveagoodnight', 'haveagoodevening',
      'sleepwell', 'sweetdreams', 'dreamsweet',
      'restwell', 'resteasy', 'restpeacefully',
      'goodnightandsweetdreams', 'goodnightandsleepwell',
      'goodnightandsweetdreams', 'goodnightandsleepwell',
      'goodnightandsweetdreams', 'goodnightandsleepwell',
      // More variations
      'byebye', 'byebyebye', 'byebyebyebye',
      'seeyalater', 'seeyasoon', 'seeyaround',
      'catchyalater', 'catchyoulater', 'talktoyoulater',
      'talklater', 'talksoon', 'talklateralligator',
      'seeyoulateralligator', 'inawhilecrocodile',
      'latersgators', 'latersalligator',
      'phirmilenge', 'phirmilte', 'phirmiltehain',
      'miltehain', 'miltehainphir', 'miltehainsoon',
      'byebhai', 'byeyaar', 'byebuddy', 'byefriend',
      'byebro', 'byesis', 'byedude', 'byeman',
      'byegirl', 'byeguy', 'byefolks', 'byeeveryone',
      'byeguys', 'byegirls', 'byep people', 'byeeveryone',
      'byefam', 'byefamily', 'byecrew', 'byeteam',
      'byesquad', 'byegang', 'byegroup', 'byebunch',
      'goodbyefornow', 'goodbyefornow', 'seeyouaround',
      'catchyoulater', 'talktoyousoon', 'talktoyoulater',
      'untilnexttime', 'untilwemeetagain', 'untilnextime',
      'goodbyemyfriend', 'goodbyebuddy', 'goodbyepal',
      'seeyouthen', 'seeyouthere', 'seeyouwhen',
      'takeiteasy', 'takecareofyourself', 'takecarebuddy',
      'haveagreatday', 'haveawonderfulday', 'haveaniceday',
      'haveagoodone', 'haveagoodnight', 'haveagoodevening',
      'sleepwell', 'sweetdreams', 'dreamsweet',
      'restwell', 'resteasy', 'restpeacefully',
    ]),
    replies: {
      formal: [
        'Goodbye. Take care!',
        'Farewell.',
        'See you later!',
        'Take care!',
        'Until next time!',
        'Have a wonderful day!',
        'Goodbye and take care!',
        'Farewell and best wishes!',
      ],
      casual: [
        'Bye!',
        'See ya!',
        'Catch you later!',
        'Later!',
        'Bye bye!',
        'Cya!',
        'Later dude!',
        'Take it easy!',
      ],
      neutral: [
        'Bye! Take care.',
        'See you!',
        'Goodbye!',
        'Take care!',
        'See you soon!',
        'Bye! Have a good one.',
        'Goodbye! Stay safe.',
      ],
    },
    titles: ['Goodbye', 'See you', 'Farewell', 'Later', 'Take care'],
  },

  ack: {
    words: new Set([
      // Single words
      'ok', 'okay', 'okie', 'k', 'kk', 'alright', 'fine', 'sure', 'cool', 'nice',
      'done', 'gotit', 'understood', 'roger', 'affirmative', 'yep', 'yup', 'yeah', 'yes',
      'hmm', 'hm', 'mhm', 'uhhuh', 'acha', 'accha', 'achha', 'theek', 'thik', 'thk', 'thike',
      'bilkul', 'sahi', 'samajhgaya', 'samajhgya', 'samajhliya',
      // Multi-word phrases: NO SPACES
      'gotit', 'rogerthat', 'soundsgood', 'soundsgreat', 'soundsfine',
      'willdo', 'cando', 'surething', 'thikhai', 'theekhai',
      'bilkulsahi', 'sahihai', 'samajhgayaji',
      'alrighty', 'alrightythen', 'okiedokie', 'okiedokey',
      'surething', 'surewill', 'surecan', 'surewilldo',
      'cando', 'willdo', 'candothat', 'willdothat',
      'soundsgood', 'soundsgreat', 'soundsfine', 'soundsok',
      'gotit', 'gotcha', 'gotyou', 'gotthat',
      'understood', 'understand', 'understandthat',
      'roger', 'rogerthat', 'rogerroger',
      'affirmative', 'affirm', 'affirmed',
      'yep', 'yup', 'yeah', 'yes', 'yessir', 'yesmaam',
      'hmm', 'hm', 'mhm', 'uhhuh', 'uhuh',
      'acha', 'accha', 'achha', 'theek', 'thik',
      'bilkul', 'sahi', 'samajhgaya',
    ]),
    replies: {
      formal: [
        'Understood.',
        'Acknowledged.',
        'Very well.',
        'I understand.',
        'Noted.',
        'I\'ve got it.',
        'Understood and noted.',
      ],
      casual: [
        'Got it!',
        'Cool!',
        'Sure thing!',
        'Alright!',
        'Okay!',
        'Sounds good!',
        'Will do!',
      ],
      neutral: [
        'Got it.',
        'Okay.',
        'Alright.',
        'Sure.',
        'Fine.',
        'Understood.',
        'Noted.',
      ],
    },
    titles: ['Got it', 'Acknowledged', 'Understood', 'Noted', 'Okay'],
  },

  how_are_you: {
    words: new Set([
      // Single words
      'howru', 'howdy', 'sup', 'wassup', 'whatsup',
      // Multi-word phrases: NO SPACES
      'howareyou', 'howru', 'howrudoing', 'howareyadoing', 'howyadoing',
      'howisitgoing', 'howsitgoing', 'howyoudoing', 'howryoudoing', 'howyadoing',
      'whatsup', 'whatsgoingon', 'whatshappening',
      'howseverything', 'howslife', 'howstheday', 'howsyourday',
      'kaiseho', 'kaisehoaap', 'kaisehobhai', 'kaisehoyaar',
      'kyahaal', 'kyahal', 'kyahaalhai', 'kyahalhai',
      'kaisechalraha', 'kaisechalrha',
      'howdoyoudo', 'howareyoudoing', 'howareyoufeeling',
      'howarethings', 'howarethingsgoing', 'howarethings',
      'howseverythinggoing', 'howseverythingwithyou',
      'howslife', 'howslifegoing', 'howsyourlife',
      'howstheday', 'howsthedaygoing', 'howwasyourday',
      'howsyourday', 'howwasyourday', 'howisyourday',
      'howareyoufeeling', 'howdoyoufeel', 'howareyoufeelingtoday',
      'howareyoudoingtoday', 'howareyoudoingnow',
      'howareyoufeelingnow', 'howareyoufeelingtoday',
    ]),
    replies: {
      formal: [
        "I'm doing well, thank you. How are you?",
        "I'm fine, thanks. How about you?",
        "I'm well, thank you. And you?",
        "I'm great, thank you. How are you doing?",
        "I'm doing fine, thank you. How about yourself?",
      ],
      casual: [
        "I'm good! What about you?",
        "Doing great! How about you?",
        "I'm doing well! You?",
        "All good! How are you?",
        "Pretty good! You?",
      ],
      neutral: [
        "I'm doing well! How are you?",
        'Good! How about you?',
        "I'm fine! How are you?",
        "I'm great! How are you doing?",
        "Doing well! How about you?",
      ],
    },
    titles: ['How are you', 'Check in', 'Catch up', 'Quick chat', 'Hello'],
  },

  yes: {
    words: new Set([
      // Single words
      'yes', 'yep', 'yup', 'yeah', 'yea', 'ya', 'yah', 'yess',
      'sure', 'absolutely', 'definitely', 'certainly', 'ofcourse',
      'ok', 'okay', 'alright', 'correct', 'right', 'true', 'affirmative',
      'bilkul', 'haan', 'han', 'hmm', 'mhm',
      // Multi-word phrases: NO SPACES
      'surething', 'ofcourse', 'absolutelyyes', 'definitelyyes',
      'yesplease', 'yesplease', 'yesindeed', 'yesabsolutely',
      'yesdefinitely', 'yescertainly', 'yesofcourse',
      'surething', 'surewill', 'surecan', 'surewilldo',
      'absolutely', 'definitely', 'certainly', 'ofcourse',
      'correct', 'right', 'true', 'affirmative',
      'yep', 'yup', 'yeah', 'yes', 'yessir', 'yesmaam',
      'bilkul', 'haan', 'han', 'hmm', 'mhm',
      'yesyes', 'yepyep', 'yupyup', 'yeahyeah',
      'suresure', 'okok', 'okayokay', 'alrightalright',
      'correctcorrect', 'rightright', 'truetrue',
      'absolutelyabsolutely', 'definitelydefinitely', 'certainlycertainly',
    ]),
    replies: {
      formal: [
        'Yes, of course.',
        'Certainly.',
        'Absolutely.',
        'That\'s correct.',
        'Indeed.',
        'Precisely.',
        'Exactly right.',
      ],
      casual: [
        'Yeah!',
        'Yep!',
        'Sure thing!',
        'Absolutely!',
        'You got it!',
        'Right on!',
        'Totally!',
      ],
      neutral: [
        'Yes.',
        'Sure.',
        'Okay.',
        'Right.',
        'Correct.',
        'Absolutely.',
        'Of course.',
      ],
    },
    titles: ['Yes', 'Agreement', 'Confirmed', 'Approved', 'Accepted'],
  },

  no: {
    words: new Set([
      // Single words
      'no', 'nope', 'nah', 'na', 'nay', 'noo',
      'nahi', 'nhi', 'naa', 'negative', 'incorrect', 'wrong',
      // Multi-word phrases: NO SPACES
      'notreally', 'notatall', 'nothanks', 'noway',
      'nochance', 'noproblem', 'noworries', 'nobiggie',
      'nothanks', 'nowayjose', 'nowayman', 'nowaydude',
      'nono', 'nopenope', 'nahnah', 'nana',
      'nonono', 'nopenopenope', 'nahnahnah',
      'negative', 'incorrect', 'wrong', 'notcorrect',
      'notright', 'nottrue', 'notaccurate',
      'nahi', 'nhi', 'naa', 'nahiye', 'nahihai',
    ]),
    replies: {
      formal: [
        'I understand.',
        'Noted.',
        'Understood.',
        'I see.',
        'Alright.',
        'Very well.',
      ],
      casual: [
        'Okay!',
        'Got it!',
        'No problem!',
        'Sure thing!',
        'Alright!',
        'Cool!',
      ],
      neutral: [
        'Okay.',
        'Understood.',
        'I see.',
        'Noted.',
        'Alright.',
        'Got it.',
      ],
    },
    titles: ['No', 'Declined', 'Noted', 'Understood', 'Acknowledged'],
  },

  maybe: {
    words: new Set([
      // Single words
      'maybe', 'perhaps', 'possibly', 'might', 'unsure', 'shayad',
      // Multi-word phrases: NO SPACES
      'maybe', 'maybeso', 'maybenot', 'maybelater',
      'perhaps', 'perhapsso', 'perhapsnot', 'perhapslater',
      'possibly', 'possiblyso', 'possiblynot', 'possiblylater',
      'might', 'mightbe', 'mightnot', 'mightlater',
      'couldbe', 'mightbe', 'notsure', 'unsure',
      'shayad', 'hosaktahai', 'hosakta', 'shayadhai',
      'maybeyes', 'maybeno', 'maybelater', 'maybesoon',
      'perhapsyes', 'perhapsno', 'perhapslater', 'perhapssoon',
      'possiblyyes', 'possiblyno', 'possiblylater', 'possiblysoon',
      'mightyes', 'mightno', 'mightlater', 'mightsoon',
    ]),
    replies: {
      formal: [
        'I understand your uncertainty.',
        'That\'s a possibility.',
        'Perhaps we can explore that.',
        'Let me think about that.',
      ],
      casual: [
        'Hmm, maybe!',
        'Could be!',
        'Possibly!',
        'Might work!',
      ],
      neutral: [
        'Maybe.',
        'Perhaps.',
        'Possibly.',
        'Could be.',
      ],
    },
    titles: ['Maybe', 'Uncertain', 'Possibility', 'Perhaps', 'Might'],
  },

  apology: {
    words: new Set([
      // Single words
      'sorry', 'sorrie', 'sorries', 'apologies', 'apologize', 'apologise',
      'oops', 'whoops', 'maafkaro', 'maafkijiye',
      // Multi-word phrases: NO SPACES
      'sorry', 'sorrysorry', 'sosorry', 'verysorry',
      'mybad', 'mymistake', 'myfault', 'myerror',
      'oops', 'whoops', 'oopsie', 'whoopsie',
      'apologies', 'apologize', 'apologise', 'apologizing',
      'maafkaro', 'maafkijiye', 'sorrybhai', 'sorryyaar',
      'excuseme', 'pardonme', 'forgiveme', 'forgive',
      'imsorry', 'iamsorry', 'soverysorry', 'reallysorry',
      'sorryaboutthat', 'sorryforthat', 'sorryforthatt',
      'sorryforthis', 'sorryaboutthis', 'sorryforthist',
      'sorryforit', 'sorryaboutit', 'sorryforthat',
      'mybad', 'mymistake', 'myfault', 'myerror',
      'oops', 'whoops', 'oopsie', 'whoopsie',
      'apologies', 'apologize', 'apologise',
      'maafkaro', 'maafkijiye', 'sorrybhai', 'sorryyaar',
    ]),
    replies: {
      formal: [
        'No need to apologize.',
        'That\'s quite alright.',
        'No worries at all.',
        'You\'re forgiven.',
        'It\'s perfectly fine.',
      ],
      casual: [
        'No problem!',
        'All good!',
        'No worries!',
        'It\'s cool!',
        'Don\'t worry about it!',
      ],
      neutral: [
        'No problem.',
        'It\'s okay.',
        'No worries.',
        'That\'s fine.',
        'Don\'t worry.',
      ],
    },
    titles: ['Apology', 'Sorry', 'My mistake', 'Oops', 'Forgiveness'],
  },

  compliment: {
    words: new Set([
      // Single words
      'good', 'great', 'awesome', 'amazing', 'wonderful', 'fantastic', 'excellent',
      'nice', 'cool', 'sweet', 'brilliant', 'perfect', 'outstanding', 'mast', 'wah',
      // Multi-word phrases: NO SPACES
      'welldone', 'goodjob', 'nicework', 'greatjob', 'excellentjob',
      'bahutaccha', 'kyabaat', 'mast', 'wah', 'wahwah',
      'verygood', 'verygreat', 'veryawesome', 'veryamazing',
      'reallygood', 'reallygreat', 'reallyawesome', 'reallyamazing',
      'sogood', 'sogreat', 'soawesome', 'soamazing',
      'prettygood', 'prettygreat', 'prettyawesome', 'prettyamazing',
      'quitegood', 'quitegreat', 'quiteawesome', 'quiteamazing',
      'extremelygood', 'extremelygreat', 'extremelyawesome', 'extremelyamazing',
      'incrediblygood', 'incrediblygreat', 'incrediblyawesome', 'incrediblyamazing',
      'absolutelygood', 'absolutelygreat', 'absolutelyawesome', 'absolutelyamazing',
      'definitelygood', 'definitelygreat', 'definitelyawesome', 'definitelyamazing',
      'certainlygood', 'certainlygreat', 'certainlyawesome', 'certainlyamazing',
      'welldone', 'goodjob', 'nicework', 'greatjob', 'excellentjob',
      'goodwork', 'greatwork', 'nicework', 'excellentwork',
      'goodgoing', 'greatgoing', 'nicegoing', 'excellentgoing',
      'goodstuff', 'greatstuff', 'nicestuff', 'excellentstuff',
    ]),
    replies: {
      formal: [
        'Thank you very much!',
        'I appreciate that.',
        'That\'s very kind of you.',
        'Thank you for the compliment.',
      ],
      casual: [
        'Thanks!',
        'Appreciate it!',
        'You\'re too kind!',
        'Thanks a lot!',
      ],
      neutral: [
        'Thank you!',
        'I appreciate it.',
        'That\'s kind of you.',
        'Thanks!',
      ],
    },
    titles: ['Compliment', 'Praise', 'Appreciation', 'Kind words', 'Thanks'],
  },

  encouragement: {
    words: new Set([
      // Single words
      'goodluck', 'bestofluck', 'goforit', 'keepgoing', 'keepitup', 'welldone',
      // Multi-word phrases: NO SPACES
      'goodluck', 'bestofluck', 'allthebest', 'bestwishes',
      'youcandoit', 'yougotthis', 'goforit', 'keepgoing', 'keepitup',
      'welldone', 'goodjob', 'greatjob', 'excellentjob',
      'allthebest', 'bestwishes', 'bestofluck', 'goodluck',
      'youcandoit', 'yougotthis', 'youcanmakeit', 'youcandoit',
      'goforit', 'keepgoing', 'keepitup', 'keepgoingstrong',
      'dontgiveup', 'nevergiveup', 'keepfighting', 'keepgoing',
      'yougotthis', 'youcandoit', 'youcanmakeit', 'youcandoit',
      'believeinyourself', 'trustyourself', 'havefaith', 'keepbelieving',
      'staystrong', 'staypositive', 'stayfocused', 'staydetermined',
      'keepyourheadup', 'keepyourchinup', 'keepsmiling', 'keeplaughing',
      'youareamazing', 'youareawesome', 'youaregreat', 'youarewonderful',
      'youarethebest', 'youarethegreatest', 'youarethemostamazing',
      'proudofyou', 'improudofyou', 'weareproudofyou',
      'keepupthegoodwork', 'keepupthegreatwork', 'keepuptheexcellentwork',
    ]),
    replies: {
      formal: [
        'Thank you for the encouragement.',
        'I appreciate your support.',
        'That means a lot.',
        'Thank you.',
      ],
      casual: [
        'Thanks!',
        'Appreciate it!',
        'You\'re the best!',
        'Thanks a ton!',
      ],
      neutral: [
        'Thank you!',
        'I appreciate it.',
        'Thanks for the support.',
        'Thank you.',
      ],
    },
    titles: ['Encouragement', 'Support', 'Motivation', 'Best wishes', 'Good luck'],
  },

  time_greeting: {
    words: new Set([
      // Single words
      'gm', 'morning', 'mornin', 'afternoon', 'evening', 'gn', 'night', 'nite',
      'namaskar', 'shubhprabhat',
      // Multi-word phrases: NO SPACES
      'goodmorning', 'goodafternoon', 'goodevening', 'goodnight',
      'morning', 'afternoon', 'evening', 'night',
      'goodmorningeveryone', 'goodmorningall', 'morningall', 'morningeveryone',
      'goodafternooneveryone', 'goodeveningeveryone', 'goodnighteveryone',
      'shubhprabhat', 'namaskar', 'namaskaram',
      'topofthemorning', 'riseandshine', 'morningbeautiful', 'morninghandsome',
      'goodmorningbeautiful', 'goodmorninghandsome', 'goodmorninggorgeous',
      'goodafternoonbeautiful', 'goodafternoonhandsome', 'goodafternoongorgeous',
      'goodeveningbeautiful', 'goodeveninghandsome', 'goodeveninggorgeous',
      'goodnightbeautiful', 'goodnighthandsome', 'goodnightgorgeous',
      'sweetdreams', 'dreamsweet', 'sleepwell', 'restwell',
      'goodnightandsweetdreams', 'goodnightandsleepwell',
    ]),
    replies: {
      formal: [
        'Good morning.',
        'Good afternoon.',
        'Good evening.',
        'Good night. Sleep well.',
      ],
      casual: [
        'Morning!',
        'Afternoon!',
        'Evening!',
        'Night!',
      ],
      neutral: [
        'Good morning.',
        'Good afternoon.',
        'Good evening.',
        'Good night.',
      ],
    },
    titles: ['Good morning', 'Good afternoon', 'Good evening', 'Good night', 'Time greeting'],
  },

  wellbeing_check: {
    words: new Set([
      // Single words
      'ok', 'okay', 'good', 'fine', 'theek', 'sabtheek', 'sabsahi',
      // Multi-word phrases: NO SPACES
      'areyouok', 'areyouokay', 'youok', 'youokay',
      'everythingok', 'everythingokay', 'allgood', 'allok',
      'theekhai', 'sabtheek', 'sabsahi', 'sabtheekhai', 'sabsahihai',
      'areyoufine', 'areyougood', 'areyoualright', 'areyouwell',
      'youfine', 'yougood', 'youalright', 'youwell',
      'everythingfine', 'everythinggood', 'everythingalright', 'everythingwell',
      'allfine', 'allgood', 'allalright', 'allwell',
      'howareyou', 'howareyoufeeling', 'howareyoudoing',
      'howareyoufeelingtoday', 'howareyoudoingtoday',
      'howareyoufeelingnow', 'howareyoudoingnow',
      'areyouokay', 'areyoualright', 'areyoufine', 'areyougood',
      'youokay', 'youalright', 'youfine', 'yougood',
      'everythingokay', 'everythingalright', 'everythingfine', 'everythinggood',
      'allokay', 'allalright', 'allfine', 'allgood',
    ]),
    replies: {
      formal: [
        'Yes, I\'m doing well. Thank you for asking.',
        'I\'m fine, thank you. How are you?',
        'Everything is good. How about you?',
      ],
      casual: [
        'All good! You?',
        'I\'m fine! How about you?',
        'Doing great! You?',
      ],
      neutral: [
        'I\'m doing well. How are you?',
        'Everything is fine. How about you?',
        'I\'m good. How are you doing?',
      ],
    },
    titles: ['Wellbeing', 'Check in', 'Are you ok', 'Everything ok', 'Status'],
  },
};

/**
 * Normalize message: lowercase, remove ALL spaces, remove punctuation
 */
function normalizeNoSpaces(msg: string): string {
  return (msg || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')   // Remove punctuation/symbols
    .replace(/\s+/g, '')              // Remove ALL spaces
    .trim();
}

/**
 * Get variations for repeated characters
 * If character repeats 3+ times, return variations with 1 and 2 repetitions
 * Example: "hiiii" -> ["hi", "hii"]
 * ✅ FIX: Better handling of excessive repetitions + short inputs (<3 chars) to prevent errors
 */
function getRepeatedCharVariations(msg: string): string[] {
  try {
    const normalized = normalizeNoSpaces(msg);
    if (!normalized) return [];

    // Hard safety cap (even if someone calls this directly elsewhere)
    if (normalized.length > 40) return [];

    const out = new Set<string>();

    const push = (v: string) => {
      if (!v) return;
      if (v === normalized) return;
      if (v.length > 20) return; // match detectFastPathCategory limits
      out.add(v);
    };

    // ✅ For very short inputs (<=4), also handle 2+ repeats (covers "okk", "hii")
    if (normalized.length <= 4 && /(.)\1+/.test(normalized)) {
      push(normalized.replace(/(.)\1+/g, '$1'));   // collapse to 1
      push(normalized.replace(/(.)\1+/g, '$1$1')); // collapse to 2
      return Array.from(out).slice(0, 2);
    }

    // ✅ For general inputs, only treat 3+ repeats (avoid damaging normal words)
    if (/(.)\1{2,}/.test(normalized)) {
      push(normalized.replace(/(.)\1{2,}/g, '$1'));
      push(normalized.replace(/(.)\1{2,}/g, '$1$1'));
    }

    return Array.from(out).slice(0, 2);
  } catch {
    return [];
  }
}

/**
 * Build lookup map: all words stored WITHOUT spaces (lowercase)
 */
function buildNoSpaceLookup(): Map<string, FastPathCategory> {
  const lookup = new Map<string, FastPathCategory>();
  
  for (const [category, data] of Object.entries(COMMON_WORDS_MAP)) {
    for (const word of data.words) {
      // Convert to lowercase, remove all spaces
      const noSpace = word.toLowerCase().replace(/\s+/g, '');
      if (noSpace) {
        lookup.set(noSpace, category as FastPathCategory);
      }
    }
  }
  
  return lookup;
}

// Build lookup map once at module load
const COMMON_WORDS_LOOKUP_NO_SPACE = buildNoSpaceLookup();

/**
 * Detect if message matches a common fast-path category
 * Simple approach: exact match + repeated character check
 * Max message size: ~20 chars
 */
export function detectFastPathCategory(raw: string): FastPathCategory | null {
  if (!raw || typeof raw !== 'string') return null;
  
  // Step 1: Check message length (max ~20 chars)
  const originalLength = raw.trim().length;
  if (originalLength === 0 || originalLength > 20) return null;
  
  // Step 2: Count words
  const originalWords = raw.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const wordCount = originalWords.length;
  
  // ✅ STRICTER: Only 1-3 words allowed
  if (wordCount === 0 || wordCount > 3) return null;
  
  // Step 3: Normalize message (lowercase, no spaces, no punctuation)
  const normalized = normalizeNoSpaces(raw);
  if (!normalized || normalized.length === 0) return null;
  
  // ✅ STRICTER: Block question words and common question patterns
  if (/(help|make|create|write|explain|code|bug|fix|kaise|kardo|kardo|please|plz|build|design|solve|name|who|what|when|where|why|how|is|are|was|were|your|ur|you|tell|say)/i.test(normalized)) {
    return null;
  }
  
  // Step 4: Exact match (fastest path)
  const exactMatch = COMMON_WORDS_LOOKUP_NO_SPACE.get(normalized);
  if (exactMatch) {
    return exactMatch;
  }
  
  // Step 5: Check repeated characters (hiiii -> check "hi" and "hii")
  const repeatedVariations = getRepeatedCharVariations(raw);
  for (const variation of repeatedVariations) {
    const match = COMMON_WORDS_LOOKUP_NO_SPACE.get(variation);
    if (match) {
      return match;
    }
  }
  
  return null;
}

/**
 * Get category-specific titles (4-5 per category)
 */
export function getCategoryTitles(category: FastPathCategory): string[] {
  return COMMON_WORDS_MAP[category]?.titles || ['New chat', 'Quick chat', 'Hello', 'Catch up'];
}

/**
 * Simple time greeting detection - just match keywords
 * Returns: 'morning' | 'afternoon' | 'night' | null
 */
function getTimeGreeting(message: string): 'morning' | 'afternoon' | 'night' | null {
  const lower = message.toLowerCase();
  
  // Morning: good morning, gm, morning, suprabhat, etc.
  if (lower.includes('morning') || lower.includes('gm') || lower.includes('suprabhat') || lower.includes('morn')) {
    return 'morning';
  }
  
  // Afternoon: good afternoon, afternoon
  if (lower.includes('afternoon') || lower.includes('aft')) {
    return 'afternoon';
  }
  
  // Night: good night, gn, night, nite
  if (lower.includes('night') || lower.includes('gn') || lower.includes('nite')) {
    return 'night';
  }
  
  return null;
}

/**
 * Generate persona-matched reply based on category and persona data
 * Uses tone (formal/casual), emoji preference, and language settings
 * Returns random selection from 5-10 options per category
 */
export function fastPathReply(category: FastPathCategory, personaData: any, originalMessage?: string): string {
  const categoryData = COMMON_WORDS_MAP[category];
  if (!categoryData) {
    return 'Hi there.';
  }

  const tone = personaData?.communicationStyle?.tone || {};
  const emojiPref =
    personaData?.preferences?.emojiPref ||
    personaData?.communicationStyle?.language?.emojiUsage ||
    'medium';

  const formal = (tone.formalCasual ?? 50) > 60;
  const casual = (tone.formalCasual ?? 50) < 40;

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)] || arr[0];

  let text = '';
  
  // Simple time greeting handling
  if (category === 'time_greeting' && originalMessage) {
    const timeGreeting = getTimeGreeting(originalMessage);
    
    if (timeGreeting === 'morning') {
      // Return "good morning" type reply
      if (formal) text = pick(categoryData.replies.formal.filter((r: string) => r.toLowerCase().includes('morning')));
      else if (casual) text = pick(categoryData.replies.casual.filter((r: string) => r.toLowerCase().includes('morning')));
      else text = pick(categoryData.replies.neutral.filter((r: string) => r.toLowerCase().includes('morning')));
      
      // Fallback if no morning replies found
      if (!text) {
        text = formal ? pick(categoryData.replies.formal) : casual ? pick(categoryData.replies.casual) : pick(categoryData.replies.neutral);
      }
    } else if (timeGreeting === 'afternoon') {
      // Return "good afternoon" type reply
      if (formal) text = pick(categoryData.replies.formal.filter((r: string) => r.toLowerCase().includes('afternoon')));
      else if (casual) text = pick(categoryData.replies.casual.filter((r: string) => r.toLowerCase().includes('afternoon')));
      else text = pick(categoryData.replies.neutral.filter((r: string) => r.toLowerCase().includes('afternoon')));
      
      // Fallback if no afternoon replies found
      if (!text) {
        text = formal ? pick(categoryData.replies.formal) : casual ? pick(categoryData.replies.casual) : pick(categoryData.replies.neutral);
      }
    } else if (timeGreeting === 'night') {
      // Return "good night" type reply
      if (formal) text = pick(categoryData.replies.formal.filter((r: string) => r.toLowerCase().includes('night')));
      else if (casual) text = pick(categoryData.replies.casual.filter((r: string) => r.toLowerCase().includes('night')));
      else text = pick(categoryData.replies.neutral.filter((r: string) => r.toLowerCase().includes('night')));
      
      // Fallback if no night replies found
      if (!text) {
        text = formal ? pick(categoryData.replies.formal) : casual ? pick(categoryData.replies.casual) : pick(categoryData.replies.neutral);
      }
    } else {
      // No time detected, use normal logic
      if (formal) {
        text = pick(categoryData.replies.formal);
      } else if (casual) {
        text = pick(categoryData.replies.casual);
      } else {
        text = pick(categoryData.replies.neutral);
      }
    }
  } else {
    // Normal category handling
    if (formal) {
      text = pick(categoryData.replies.formal);
    } else if (casual) {
      text = pick(categoryData.replies.casual);
    } else {
      text = pick(categoryData.replies.neutral);
    }
  }

  // Add emoji if preference is high
  if (emojiPref === 'high') {
    const e: Record<FastPathCategory, string> = {
      greeting: '👋',
      thanks: '😊',
      bye: '👋',
      ack: '👍',
      how_are_you: '😊',
      yes: '👍',
      no: '👌',
      maybe: '🤔',
      apology: '😊',
      compliment: '😊',
      encouragement: '💪',
      time_greeting: '👋',
      wellbeing_check: '😊',
    };
    return `${text} ${e[category] || ''}`.trim();
  }

  return text;
}

