import { Button, Card, CardContent, Stack, Typography } from '@kyc/ui'
import { useState } from 'react'

import styles from './application-review-form.module.css'

export interface ApplicationReviewFormProps {
  onSubmit: () => void
  onReturnToForm: () => void
}

/** Final review before submission; the caller decides where each action goes. */
export function ApplicationReviewForm({
  onSubmit,
  onReturnToForm,
}: ApplicationReviewFormProps) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <main className={styles.reviewPage}>
      <Card className={styles.reviewCard}>
        <CardContent>
          <Stack
            component="form"
            onSubmit={(event) => {
              event.preventDefault()
              if (event.currentTarget.reportValidity()) {
                onSubmit()
              }
            }}
            spacing={2}
          >
            <Typography component="h1" variant="heading">
              Review application
            </Typography>
            <Typography>Your application is ready for review.</Typography>
            <label>
              <input
                checked={confirmed}
                name="confirmed"
                onChange={(event) => setConfirmed(event.target.checked)}
                required
                type="checkbox"
              />{' '}
              I confirm the information is complete and accurate.
            </label>
            <Button type="submit">Submit</Button>
            <Button type="button" variant="secondary" onPress={onReturnToForm}>
              Return to form
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </main>
  )
}
