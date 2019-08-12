/* 
  Ticker.cpp - esp8266 library that calls functions periodically

  Copyright (c) 2014 Ivan Grokhotkov. All rights reserved.
  This file is part of the esp8266 core for Arduino environment.
 
  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.

  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public
  License along with this library; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/



#include "c_types.h"
#include "eagle_soc.h"
#include "ets_sys.h"
#include "osapi.h"

#include <MyTicker.h>

MyTicker::MyTicker()
//: _timer(nullptr)
{
//    _timer=nullptr;
}

MyTicker::~MyTicker()
{
    detach();
}

void MyTicker::_attach_ms(long seconds, cb_with_arg_t callback, uint32_t  arg )
{
    int factor = ceil((float)seconds / 3600);
    
    _timer.detach();

    if (factor == 0) {
        return;
    }
 //   sprintf(_debugMsg, "Ticker %d attached", _seconds); 
    _timer.attach( (float)seconds/factor, std::bind(&MyTicker::_static_callback, this)  );
}

void MyTicker::detach()
{
    _timer.detach();
    _callback_function = nullptr;
}

bool MyTicker::armed()
{
    return _armed;
}

void MyTicker::run()
{
    
 //               sprintf(_debugMsg, "Ticker %d - in RUN %d ", _seconds, _armed); 
    if (_armed && _callback_function) {
        _callback_function();
        _last_called = millis();//time(nullptr);
        _armed = false;
    }

//    delay(1000);
}

void MyTicker::_static_callback(void* arg)
{
    MyTicker* _this = (MyTicker*)arg;
    if (_this == nullptr)
    {
//        sprintf(_this->_debugMsg, "_this is null pointer"); 
        return;
    }
    if (_this->_callback_function)
    {
//                sprintf(_this->_debugMsg, "Ticker %d - ticked", _this->_seconds); 

        if (_this->_last_called + (_this->_seconds-2)*1000 <= millis()) {
//                sprintf(_this->_debugMsg, "Ticker %d - arming", _this->_seconds); 
                _this->_armed = true;
            //_this->_callback_function();
        }
    }
}
