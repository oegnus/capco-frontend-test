import { Outlet, useNavigate } from 'react-router'

import { LogOutLink } from '../components/account/log-out-link'

import { requireSignedIn } from './-session-guard'
import styles from './applications.module.css'

/** Every applicant page needs a session; this layout guards them all. */
export async function clientLoader() {
  await requireSignedIn()
  return null
}

export default function ApplicationsLayout() {
  const navigate = useNavigate()
  return (
    <>
      <nav aria-label="Account" className={styles.bar}>
        <LogOutLink
          onLoggedOut={() => {
            // Replace so Back does not return to a signed-in page.
            void navigate('/sign-in', { replace: true })
          }}
        />
      </nav>
      <Outlet />
    </>
  )
}
