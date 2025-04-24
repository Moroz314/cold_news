from telethon.sync import TelegramClient, events

api_id = 21571955
api_hash = 'e3e614651aba0bffc9b26526a3c83914'

client = TelegramClient('my_session', api_id, api_hash)

@client.on(events.NewMessage(chats=('pelmen314')))
async def handler(event):
    print(f"📢 {event.chat.title}:\n{event.message.text}\n---")

print("Запуск мониторинга...")
client.start() 
client.run_until_disconnected()
