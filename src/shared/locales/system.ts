import { registerTranslations, registerTranslationTemplates } from '../i18n'
registerTranslations({
  '終了処理中のため操作できません。': 'Actions are unavailable while the game is closing.',
  '保存ファイルや設定を上書きしない別名を指定してください。': 'Choose a different filename so existing saves and settings are not overwritten.',
  '帯': 'Strip',
  'タスクバー百鬼行': 'Taskbar Hyakkiko',
  '管理パネルを開く': 'Open management panel', '帯を隠す': 'Hide strip', '帯を表示': 'Show strip', '再開': 'Resume', '一時停止': 'Pause', '終了': 'Quit',
  'おかえりなさい': 'Welcome back', '留守の間の報酬が届いています。管理パネルで受け取れます。': 'Your offline rewards are ready. Claim them in the management panel.',
  'セーブを書き出す': 'Export save', 'セーブを書き出せません': 'Could not export save', 'セーブを保存できません': 'Could not save game',
  '未保存の進行があります。': 'You have unsaved progress.', 'ゲームへ戻る': 'Return to game', '保存せず終了': 'Quit without saving',
  '保存先を確認して再試行するか、別の場所へ書き出してください。保存せず終了すると、この起動中の未保存分は失われます。': 'Check the save location and retry, or export to another location. Quitting without saving will lose unsaved progress from this session.',
  'タスクバー百鬼行を起動できません': 'Could not start Taskbar Hyakkiko',
  '街へ戻る': 'Return to town', '準備OK': 'Ready', '奥義はLv10で解放': 'Ultimate unlocks at Lv 10', '戦闘不能': 'Knocked out',
  'クリックでステージ画面': 'Click to open dungeon', 'クリックで育成画面': 'Click to manage character', '周回中': 'Farming', '（ボス）': ' (Boss)',
  '画像を読み込めませんでした。再起動してください。': 'Images could not be loaded. Please restart.',
  'ゲームを読み込めませんでした。保存データを消さずに、ページを読み直してください。': 'The game could not be loaded. Reload the page without deleting your save data.',
  '冒険の様子': 'Adventure', '戦闘の読み込み中': 'Loading battle',
})
registerTranslationTemplates([
  { ja: 'このセーブは新しいバージョン（形式{version}）で保存されています。対応する最新版で開いてください。セーブは変更していません。\n{path}', en: 'This save was created by a newer version (format {version}). Open it with a compatible latest version. Your save has not been changed.\n{path}' },
  { ja: 'セーブを安全に読み込めませんでした。ファイルを変更せず起動を中止しました。セーブのフォルダを確認してください。\n{path}', en: 'The save could not be loaded safely. Startup was stopped without changing the file. Check your save folder.\n{path}' },
  { ja: '出撃中：{names}', en: 'Deployed: {names}' },
  { ja: '{seconds}秒', en: '{seconds}s' },
  { ja: 'ウェーブ {wave}/10', en: 'Wave {wave}/10' },
  { ja: '情念 {value}', en: 'Obsession {value}' },
  { ja: 'セーブを保存できないため一時停止しました。保存先の空き容量と書き込み権限を確認し、再試行またはセーブを書き出してください。\n{error}', en: 'Paused because the game could not be saved. Check free space and write permissions, then retry or export your save.\n{error}' },
])
