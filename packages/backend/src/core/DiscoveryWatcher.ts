import { Logger, TaskQueue } from '@l2beat/common'
import { UnixTime } from '@l2beat/types'
import { providers } from 'ethers'

import { DiscoveryWatcherRepository } from '../peripherals/database/discovery/DiscoveryWatcherRepository'
import { DiscordClient } from '../peripherals/discord/DiscordClient'
import { Clock } from './Clock'
import { ConfigReader } from './discovery/ConfigReader'
import { DiscoveryContract } from './discovery/DiscoveryConfig'
import { DiscoveryEngine } from './discovery/DiscoveryEngine'
import { ProjectParameters } from './discovery/types'
import { diffDiscovery, DiscoveryDiff } from './discovery/utils/diffDiscovery'
import { diffToMessages } from './discovery/utils/diffToMessages'

export class DiscoveryWatcher {
  private readonly taskQueue: TaskQueue<void>

  constructor(
    private readonly provider: providers.AlchemyProvider,
    private readonly discoveryEngine: DiscoveryEngine,
    private readonly discordClient: DiscordClient | undefined,
    private readonly configReader: ConfigReader,
    private readonly repository: DiscoveryWatcherRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {
    this.logger = this.logger.for(this)
    this.taskQueue = new TaskQueue(
      () => this.update(),
      this.logger.for('taskQueue'),
    )
  }

  start() {
    this.logger.info('Started')
    return this.clock.onNewHour(() => {
      this.taskQueue.addToFront()
    })
  }

  async update() {
    // TODO: get block number based on clock time
    const blockNumber = await this.provider.getBlockNumber()
    const timestamp = UnixTime.now()
    this.logger.info('Update started', { blockNumber })

    const projectConfigs = await this.configReader.readAllConfigs()

    for (const projectConfig of projectConfigs) {
      this.logger.info('Discovery started', { project: projectConfig.name })

      try {
        const discovery = await this.discoveryEngine.run(
          projectConfig,
          blockNumber,
        )

        const diff = await this.findChanges(
          projectConfig.name,
          discovery,
          projectConfig.overrides,
        )

        if (diff.length > 0) {
          const messages = diffToMessages(projectConfig.name, diff)
          await this.notify(messages)
        }

        await this.repository.addOrUpdate({
          projectName: projectConfig.name,
          timestamp,
          blockNumber,
          discovery,
        })

        this.logger.info('Discovery finished', { project: projectConfig.name })
      } catch (error) {
        this.logger.error(error)
      }
    }
    this.logger.info('Update finished', { blockNumber })
  }

  async findChanges(
    name: string,
    discovery: ProjectParameters,
    overrides?: Record<string, DiscoveryContract>,
  ): Promise<DiscoveryDiff[]> {
    const databaseEntry = await this.repository.findLatest(name)

    const currentContracts = databaseEntry
      ? databaseEntry.discovery.contracts
      : (await this.configReader.readDiscovery(name)).contracts

    return diffDiscovery(currentContracts, discovery.contracts, overrides ?? {})
  }

  async notify(messages: string[]) {
    if (!this.discordClient) {
      // TODO: maybe only once? rethink
      this.logger.info(
        'DiscordClient not setup, notification has not been sent. Did you provide correct .env variables?',
      )
      return
    }

    for (const message of messages) {
      await this.discordClient.sendMessage(message).then(
        () => this.logger.info('Notification to Discord has been sent'),
        (e) => this.logger.error(e),
      )
    }
  }
}