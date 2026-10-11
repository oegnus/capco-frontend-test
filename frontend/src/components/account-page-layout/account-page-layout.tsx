import { Card, CardContent } from '@kyc/ui'

import styles from './account-page-layout.module.css'

import type { ReactNode } from 'react'

export interface AccountPageLayoutProps {
  children: ReactNode
}

/** Full-height page with a centred card, used by the account access screens. */
export function AccountPageLayout({ children }: AccountPageLayoutProps) {
  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardContent className={styles.cardContent}>{children}</CardContent>
      </Card>
    </main>
  )
}
