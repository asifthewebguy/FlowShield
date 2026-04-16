# Sounds

## session-end.mp3

Short alert chime (~1–2 s) played in the FocusTimer when a session's planned duration elapses.

**Required at**: `/public/sounds/session-end.mp3`

The asset is not checked into the repo — please drop a royalty-free chime here before building.
If the file is missing, the FocusTimer falls through silently (the `.play()` call is wrapped in `.catch()`),
so the browser Notification and the 5-minute auto-end still fire.

Suggested sources:
- https://mixkit.co/free-sound-effects/notification/
- https://pixabay.com/sound-effects/search/chime/
