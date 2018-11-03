const Discord = require('discord.js')
const stringArgv = require('string-argv')
const arg = require('arg')
const ms = require('ms')

const client = new Discord.Client()

const prefix = '%'

client.on('ready', () => {
  console.log('ready!')
  client.user.setActivity(`${prefix}help`, {
    type: 'WATCHING',
  })
})


// * \`EMOJI\` (multiple allowed) (optional): option for which people can vote for. defaults to :red_circle: and :large_blue_circle:
const makeOptHelp = `
* \`TIME\` (only use once) (optional): length of time at which votes will be frozen. use any time like \`1 hour\`, \`5m\`, or \`3.45 hrs\`. if not provided, vote does not expire
* \`@SOMEONE\` (multiple allowed) (required): a person who is allowed to vote. the bot sends them a DM
`

const commands = new Map([
  ['help', ['sends help info', '', async (msg) => {
    const commandHelp = [...commands.entries()].map((command) => ({
      name: `command: \`${prefix}${command[0]} ${command[1][1]}\``,
      value: command[1][0],
      inline: false,
    }))
    await msg.channel.send(new Discord.RichEmbed({
      color: 0x33ff33,
      description: 'anonymously vote with anon votebot!',
      fields: [{
        name: 'calling commands',
        value: `commands can be called by mentioning <@${client.user.id}>, or by prefixing commands with \`${prefix}\``,
        inline: false,
      }, ...commandHelp, {
        name: `help for \`${prefix}make\``,
        value: makeOptHelp,
        inline: false,
      }],
    }))
  }]],
  ['make', [
    'make a new vote',
    '[-l|--length] TIME [-v|--voter] @SOMEONE message',
    async (createMsg, content) => {
      let args
      const argVoters = []
      let argLength
      let argContent
      try {
        args = arg({
          '--length': String,
          '-l': '--length',
          // '--option': [String],
          // '-o': '--option',
          '--voter': [String],
          '-v': '--voter',
        }, {
          argv: stringArgv(content),
        })
        await Promise.all(args['--voter'].map(async (sf) => {
          const userMatch = sf.match(/<@!?[0-9]+>/)
          if (userMatch === null) {
            const roleMatch = sf.match(/<@&[0-9]+>/)
            if (roleMatch === null) {
              throw new Error()
            }
            console.log(roleMatch[0], roleMatch[0].replace(/[<>@&]/g, ''))
            argVoters.push(...(createMsg.guild.roles.get(roleMatch[0].replace(/[<>@&]/g, '')).members.values()))
          } else {
            argVoters.push(await client.fetchUser(userMatch[0].replace(/[<>@]/g, '')))
          }
        }))
        if (args['--length'] !== undefined) {
          argLength = ms(args['--length'])
        }
        argContent = args._.join(' ')
        if (argContent === '') {
          throw new Error()
        }
      } catch (e) {
        createMsg.channel.send(`<@${createMsg.author.id}> parsing your command failed`)
        return
      }
      let votes = [0, 0]
      let votesClosed = false
      let voteMsgs = []
      const makeReport = () => new Discord.RichEmbed({
        color: 0x33ff33,
        description: `<@${createMsg.author.id}> made a vote`,
        fields: [{
          name: 'vote content',
          value: argContent,
          inline: false,
        }, {
          name: 'results',
          value: `\ud83d\udd34: ${votes[0]} \ud83d\udd35: ${votes[1]}`,
          inline: false,
        }, {
          name: votesClosed ? 'closed' : 'close',
          value: votesClosed ? 'voting is now closed' : `${argLength === undefined ? '' : `voting will be closed ${ms(argLength, {
            long: true,
          })} from when the vote was made\n`}<@${createMsg.author.id}> can manually close the vote by reacting with \ud83d\uded1`,
          inline: false,
        }],
      })
      const reportMsg = await createMsg.channel.send(makeReport())
      await reportMsg.react('\ud83d\uded1')
      await Promise.all(argVoters.map(async (user) => {
        if (user.bot) {
          return
        }
        const voteMsg = await (await user.createDM()).send(new Discord.RichEmbed({
          color: 0x33ff33,
          description: `you have a new vote from ${createMsg.author.username}#${createMsg.author.discriminator}`,
          fields: [{
            name: 'vote content',
            value: argContent,
            inline: false,
          }, {
            name: 'instructions',
            value: 'react with \ud83d\udd34 or \ud83d\udd35',
            inline: false,
          }],
        }))
        await voteMsg.react('\ud83d\udd34')
        await voteMsg.react('\ud83d\udd35')
        let voted = false
        const sentCollector = new Discord.ReactionCollector(voteMsg, (reaction) => {
          const reactionEmoji = reaction.emoji.toString()
          if (!reaction.users.some(reactionUser => reactionUser.id !== client.user.id)) {
            return false
          }
          if (reactionEmoji !== '\ud83d\udd34' && reactionEmoji !== '\ud83d\udd35') {
            return false
          }
          return true
        })
        voteMsgs.push([voteMsg, null, sentCollector])
        sentCollector.on('collect', (reaction) => {
          if (voted || votesClosed) {
            return
          }
          voted = true
          sentCollector.stop()
          const reactionEmoji = reaction.emoji.toString()
          voteMsg.edit(new Discord.RichEmbed({
            color: 0x33ff33,
            description: 'you have already voted',
            fields: [{
              name: 'vote content',
              value: argContent,
              inline: false,
            }, {
              name: 'your vote',
              value: reactionEmoji,
              inline: false,
            }],
          }))
          const sentMsgElement = voteMsgs.find(sentMsgElement => sentMsgElement[0] === voteMsg)
          sentMsgElement[1] = reactionEmoji
          if (reactionEmoji === '\ud83d\udd34') {
            votes[0] += 1
          } else {
            votes[1] += 1
          }
          reportMsg.edit(makeReport())
        })
      }))
      const closeVote = () => {
        if (votesClosed) {
          return
        }
        votesClosed = true
        closedCollector.stop()
        reportMsg.edit(makeReport())
        voteMsgs.forEach((sentMsg) => {
          if (sentMsg[1] === null) {
            sentMsg[2].stop()
          }
          sentMsg[0].edit(new Discord.RichEmbed({
            color: 0x33ff33,
            description: 'voting is now closed',
            fields: [{
              name: 'vote content',
              value: argContent,
              inline: false,
            }, {
              name: 'your vote',
              value: sentMsg[1] === null ? 'none' : sentMsg[1],
              inline: false,
            }],
          }))
        })
      }
      const closedCollector = new Discord.ReactionCollector(reportMsg, (reaction) => {
        const reactionEmoji = reaction.emoji.toString()
        if (reactionEmoji !== '\ud83d\uded1') {
          return false
        }
        if (reaction.users.some(reactionUser => reactionUser.id === createMsg.author.id)) {
          return true
        }
        return false
      })
      closedCollector.on('collect', () => {
        closeVote()
      })
      if (argLength !== undefined) {
        setTimeout(() => {
          closeVote()
        }, argLength)
      }
  }]],
])

client.on('message', (msg) => {
  if (msg.author.bot) {
    return
  }
  let content = msg.content.trim()
  const mentionsBot = content.startsWith(`<@${client.user.id}>`)
  const prefixBot = content.startsWith(prefix) 
  if (!prefixBot && !mentionsBot) {
    return
  }
  content = content.substr(mentionsBot ? (client.user.id.length + 3) : prefix.length)
  const commandName = content.trim().split(' ', 1)[0]
  const command = commands.get(commandName.toLowerCase())
  if (command === undefined) {
    commands.get('help')[2](msg)
    return
  }
  content = content.substr(commandName.length + 1)
  command[2](msg, content)
})

client.login(process.env.APP_TOKEN)
