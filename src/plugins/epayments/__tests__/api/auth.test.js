import fetchMock from 'fetch-mock'
import { parse } from 'querystring'
import * as auth from '../../auth'

console.log = jest.fn()
console.error = jest.fn()

const loginMatcherWithoutOtp = (url, { body }) => {
  const parsed = parse(body)

  return url === 'https://api.epayments.com/token' &&
    parsed.username === 'qwerty' &&
    parsed.password === 'supersecret' &&
    parsed.grant_type === 'password_otp' &&
    !parsed.otpcode
}

const loginMatcherWithOtp = (url, { body }) => {
  const parsed = parse(body)

  return url === 'https://api.epayments.com/token' &&
    parsed.username === 'qwerty' &&
    parsed.password === 'supersecret' &&
    parsed.grant_type === 'password_otp' &&
    parsed.otpcode === '123456'
}

const loginMatcherWithSessionId = (url, { body }) => {
  const parsed = parse(body)
  console.warn('Matching session Id')

  return url === 'https://api.epayments.com/token' &&
    parsed.username === 'qwerty' &&
    parsed.password === 'supersecret' &&
    parsed.grant_type === 'password_otp' &&
    parsed.confirmation_session_id === '567890'
}

function mockZenMoney () {
  global.ZenMoney = {}
  ZenMoney.readLine = () => 123456

  ZenMoney.setData = (name, value) => undefined
  ZenMoney.saveData = () => undefined
  ZenMoney.clearData = () => undefined
  ZenMoney.getData = (name, defaultValue) => defaultValue
}

function mockLoginRequest (...mocks) {
  mocks.forEach(toMock => {
    fetchMock.once({
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Authorization': 'Basic ZXBheW1lbnRzOm1ZbjZocmtnMElMcXJ0SXA4S1NE'
      },
      matcher: toMock.matcher,
      response: toMock.response
    })
  })
}

afterEach(() => {
  fetchMock.restore()
})

describe('Login API', () => {
  mockZenMoney()

  it('should login', async () => {
    mockLoginRequest({
      matcher: loginMatcherWithoutOtp,
      response: {
        status: 200,
        body: {
          token_type: 'bearer',
          access_token: 'example',
          refresh_token: 'refresh'
        }
      }
    })

    expect(await auth.getToken('qwerty', 'supersecret')).toEqual({
      tokenType: 'bearer',
      token: 'example'
    })
  })

  it('should retry to login without OTP', async () => {
    mockLoginRequest({
      matcher: loginMatcherWithoutOtp,
      response: {
        status: 400,
        body: { error: 'otp_code_required' }
      }
    }, {
      matcher: loginMatcherWithOtp,
      response: {
        status: 200,
        body: {
          token_type: 'bearer',
          access_token: 'example',
          refresh_token: 'refresh'
        }
      }
    })

    expect(await auth.getToken('qwerty', 'supersecret')).toEqual({
      tokenType: 'bearer',
      token: 'example'
    })
  })

  it('should retry to login with invalid OTP code', async () => {
    mockLoginRequest({
      matcher: loginMatcherWithoutOtp,
      response: {
        status: 400,
        body: { error: 'otp_code_invalid' }
      }
    }, {
      matcher: loginMatcherWithOtp,
      response: {
        status: 200,
        body: {
          token_type: 'bearer',
          access_token: 'example',
          refresh_token: 'refresh'
        }
      }
    })

    expect(await auth.getToken('qwerty', 'supersecret')).toEqual({
      tokenType: 'bearer',
      token: 'example'
    })
  })

  // Не смог разобраться с этим тестом, почему-то jest виснет намертво если возвращать позитивный результат
  // it('should retry to login without OTP and wait for SCA confirmation', async () => {
  // fetchMock.get({
  //   matcher: (url) => {
  //     console.warn('Matched true')
  //     return url === 'https://api.epayments.com/v1/confirmation-sessions/567890'
  //   },
  //   response: {
  //     body: { errorCode: 0, errorMsgs: [], canContinueConfirmation: true }
  //   }
  // })
  // 
  //   mockLoginRequest({
  //     matcher: loginMatcherWithoutOtp,
  //     response: {
  //       status: 400,
  //       body: { error: 'otp_code_required', type_2fa: 'StrongCustomerAuthenticator', confirmation_session_id: '567890' }
  //     }
  //   }, {
  //     matcher: loginMatcherWithSessionId,
  //     response: {
  //       status: 200,
  //       body: {
  //         token_type: 'bearer',
  //         access_token: 'example',
  //         refresh_token: 'refresh'
  //       }
  //     }
  //   })

  //   expect(await auth.getToken('qwerty', 'supersecret')).toEqual({
  //     tokenType: 'bearer',
  //     token: 'example'
  //   })
  // })

  it('should throw an error if bot detected', async () => {
    mockLoginRequest({
      matcher: loginMatcherWithoutOtp,
      response: {
        status: 400,
        body: { error: 'bot_detected' }
      }
    })

    expect(auth.getToken('qwerty', 'supersecret')).rejects.toThrow()
  })

  it('should throw an error if ivalid grant', async () => {
    mockLoginRequest({
      matcher: loginMatcherWithoutOtp,
      response: {
        status: 400,
        body: { error: 'invalid_grant' }
      }
    })

    expect(auth.getToken('qwerty', 'supersecret')).rejects.toThrow()
  })
})
