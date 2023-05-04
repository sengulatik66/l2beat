import {
  assert,
  EthereumAddress,
  gatherAddressesFromUpgradeability,
} from '@l2beat/shared'

import { ProjectDiscovery } from '../../../ProjectDiscovery'
import { HARDCODED } from '../../hardcoded'

describe('HARDCODED: zksync2', () => {
  const discovery = new ProjectDiscovery('zksync2')

  // currently UPGRADE_NOTICE_PERIOD is set as a constant inside Config.sol
  // https://etherscan.io/address/0x2a2d6010202B93E727b61a60dfC1d5CF2707c1CE#code#F6#L51
  // if this asset is throwing it means that the zkSync DiamondProxy facets changed
  // read the source code and figure out whether the upgradeability risk is different
  it('upgradeability + validator failure', () => {
    const upgradeability = discovery.getContract('DiamondProxy').upgradeability
    const facetAddresses = gatherAddressesFromUpgradeability(upgradeability)

    assert(
      facetAddresses.every((f) =>
        HARDCODED.ZKSYNC_2.FACETS.includes(f.toString()),
      ) && facetAddresses.length === HARDCODED.ZKSYNC_2.FACETS.length,
      `Upgrade facet changed, see the source code for the new upgradeability risk. 
      Additionally, the validator failure risk might have changed.`,
    )
  })

  // currently the security council is set as ZERO address
  // when this test fails it means that the security council changed
  // update the permissons section and updgradeability risk
  it('security council', () => {
    const address = discovery.getAddressFromValue(
      'DiamondProxy',
      'getSecurityCouncil',
    )
    assert(
      address === EthereumAddress(HARDCODED.ZKSYNC_2.SECURITY_COUNCIL),
      'Security Council changed, upgrade returned value and upgradeability risk.',
    )
  })

  // currently the governor is set as a multisig
  // when this test fails it means that the governor changed
  // update the permissons section and updgradeability risk
  it('governor', () => {
    const address = discovery.getAddressFromValue('DiamondProxy', 'getGovernor')
    assert(
      address === EthereumAddress(HARDCODED.ZKSYNC_2.GOVERNOR),
      'Governor changed, upgrade returned value and upgradeability risk.',
    )
  })
})