import { useNavigate } from 'react-router'

import { CreateAccountForm } from '../components/account/create-account-form'

import { accountAccessHref, parseAccountAccessSearch } from './-return-target'

import type { Route } from './+types/create-account'

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Create your account - KYC' }]
}

export function clientLoader({ request }: Route.ClientLoaderArgs) {
  const search = Object.fromEntries(new URL(request.url).searchParams)
  return parseAccountAccessSearch(search)
}

export default function CreateAccountRoute({
  loaderData,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  return (
    <CreateAccountForm
      onNavigate={(href) => {
        void navigate(href)
      }}
      signInHref={accountAccessHref('/sign-in', loaderData.returnTo)}
    />
  )
}
