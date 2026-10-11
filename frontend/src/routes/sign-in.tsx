import { useNavigate } from 'react-router'

import { SignInForm } from '../components/sign-in-form/sign-in-form'

import {
  accountAccessHref,
  journeyDestination,
  parseAccountAccessSearch,
} from './-return-target'
import { redirectIfSignedIn } from './-session-guard'

import type { Route } from './+types/sign-in'

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sign in - KYC' }]
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  await redirectIfSignedIn()
  const search = Object.fromEntries(new URL(request.url).searchParams)
  return parseAccountAccessSearch(search)
}

export default function SignInRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  return (
    <SignInForm
      createAccountHref={accountAccessHref(
        '/create-account',
        loaderData.returnTo,
      )}
      onNavigate={(href) => {
        void navigate(href)
      }}
      onSignedIn={(href) => {
        // Replace so Back does not return to the sign-in form.
        void navigate(journeyDestination(href), { replace: true })
      }}
    />
  )
}
